// Protected-range detection runs on every public check, so it must stay linear in the text length (ticket 02).

import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { blockedRanges, findQuotePairs, protectedRanges, rangeChecker, type Range } from "../src/text.ts";
import { markResponse, markText, verify } from "../src/cpmark.ts";

// Inputs that made a backtracking pattern scan again from every start position, as functions of the length.
const HOSTILE: Record<string, (n: number) => string> = {
  letters: (n) => "a".repeat(n),
  dots: (n) => "a.".repeat(n / 2),
  hyphens: (n) => "a-".repeat(n / 2),
  "e-mail local part without domain": (n) => `${"a".repeat(n)}@`,
  "e-mail domain without dot": (n) => `a@${"b".repeat(n)}`,
  "e-mail domain without final letter": (n) => `a@b.${"1".repeat(n)}`,
  "url without end": (n) => `https://${"a".repeat(n)}`,
  "unclosed inline code": (n) => `\`${"a".repeat(n)}`,
  "unclosed link": (n) => `[${"a".repeat(n)}`,
  "unclosed link target": (n) => `[a](${"b".repeat(n)}`,
  "unclosed html tag": (n) => `<${"a".repeat(n)}`,
  "unclosed fence": (n) => `\`\`\`${"a".repeat(n)}`,
  "many backticks": (n) => "`".repeat(n),
  "many brackets": (n) => "[".repeat(n),
  "many angle brackets": (n) => "<".repeat(n),
  "many opening quotes": (n) => "„a ".repeat(n / 3),
  "opening quotes between code spans": (n) => "„a `b` ".repeat(n / 7),
};

// Inputs with a choice point every few characters: verification scans all of them. They repeat one context;
// with distinct contexts the exact p-value is quadratic in the number of points (ticket 29).
const DENSE: Record<string, (n: number) => string> = {
  approximately: (n) => "ca. 5 ".repeat(n / 6),
  furthermore: (n) => "zudem ".repeat(n / 6),
  percent: (n) => "5 % ".repeat(n / 4),
  dash: (n) => "a - ".repeat(n / 4),
  "choice points between code spans": (n) => "ca. 5 `x` ".repeat(n / 10),
  quotes: (n) => "„a“ ".repeat(n / 4),
};

/** Fastest of five runs after one warm-up run, in ms: the minimum is the least disturbed by GC and load. */
function ms(fn: () => void): number {
  fn();
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    fn();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}

/**
 * Linear growth: four times the input may take at most ten times as long (quadratic takes sixteen times).
 * Below `floor` ms the ratio is timer noise and the run passes on its absolute time; the quadratic
 * implementation before ticket 02 took seconds at these sizes.
 */
function assertLinear(name: string, make: (n: number) => string, run: (s: string) => unknown, n: number, floor: number) {
  const small = make(n);
  const large = make(4 * n);
  const t1 = ms(() => run(small));
  const t4 = ms(() => run(large));
  assert.ok(t4 < floor || t4 < 10 * t1, `${name}: ${t1.toFixed(1)} ms for ${small.length}, ${t4.toFixed(1)} ms for ${large.length}`);
}

test("protected ranges: linear on hostile input", () => {
  for (const [name, make] of Object.entries(HOSTILE)) assertLinear(name, make, blockedRanges, 25_000, 100);
});

test("verification: linear on hostile and choice-point-dense input", () => {
  const customers = [{ id: 101, key: "customer-a-secret" }];
  const inputs = { letters: HOSTILE.letters, dots: HOSTILE.dots, hyphens: HOSTILE.hyphens, ...DENSE };
  for (const [name, make] of Object.entries(inputs)) assertLinear(name, make, (s) => verify(s, customers), 12_500, 1000);
});

test("signature placement: linear on long lines (the model's output can be steered by a prompt)", () => {
  const o = { key: "customer-a-secret", layers: [], signature: { customerId: 101 } };
  const lines: Record<string, (n: number) => string> = {
    "spaces before the line end": (n) => `${" ".repeat(n)}x`,
    "spaces before a table pipe": (n) => `| a ${" ".repeat(n)}|`,
    "thematic break candidates": (n) => `${"- ".repeat(n / 2)}x`,
  };
  for (const [name, make] of Object.entries(lines)) assertLinear(name, make, (s) => markResponse(s, o), 25_000, 100);
});

// The patterns before ticket 02, kept as the reference: on short inputs their backtracking does not matter.
const OLD: Record<string, RegExp> = {
  email: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+\.[\p{L}\p{N}.-]*\p{L}/gu,
  link: /\[[^\]\n]*\]\([^)\n]*\)/g,
  tag: /<[^>\n]+>/g,
};
const CODE_AND_URL = [/```[\s\S]*?(?:```|$)/g, /`[^`\n]+`/g, /(?:https?:\/\/|www\.)[^\s<>"„“”»«]*[^\s<>"„“”»«.,;:!?)]/gi];

/** protectedRanges as the old regexes computed it, sorted. */
function oldProtectedRanges(s: string): Range[] {
  const r: Range[] = [];
  for (const re of [...CODE_AND_URL, OLD.link, OLD.email, OLD.tag]) for (const m of s.matchAll(re)) r.push([m.index, m.index + m[0].length]);
  return r.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const sorted = (r: Range[]) => [...r].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

// Each string targets one decision of the scanners: where a run stops, where a failed opener resumes, how far
// back a local part reaches, and surrogate pairs.
const ADVERSARIAL = [
  "Schreiben Sie an info@example.org.", "Mail: max.mustermann+shop@sub.beispiel-shop.de, danke", "Kontakt: jürgen@müller.de!",
  "a@b.c1 und x@y.z", "Preis 5@home ist kein Kontakt", "two: a@b.de c@d.com", "user@@example.org", "a@b@c.de",
  "-._%+@x-y.z9.de- und @nur.domain", "name@domain.", "name@domain.c-", "name@domain.co.uk.", "x@y.zz.11",
  "a@b.dex@y.de", "a@b.de.x@y.de", "𝒜𝒷@𝒸.de und 😀a@b.de", "\uDC00a@b.de", "a\uD835@b.de",
  "x <a<b> y", "<>", "<\n>", "a < b <i>", "<<a>>", "<a>\n<b", "<a\n<b>",
  "[a](x[c](d)", "[]()", "[a]\n(b)", "[a](b\n)", "[a [b](c)", "[[a](b)", "[a](b)(c)", "[a]](b)", "[a](b [c](d))",
  "`a` [x](y) <b> c@d.de https://e.org/f.", "```\n<a>[b](c)\n```d@e.fg",
];

test("scanners: same ranges as the previous regexes on adversarial and random input", () => {
  for (const text of ADVERSARIAL) assert.deepEqual(sorted(protectedRanges(text)), oldProtectedRanges(text), JSON.stringify(text));
  // Seeded random concatenations of the characters the scanners decide on.
  const alphabet = ["a", "b", "1", ".", "-", "@", "[", "]", "(", ")", "<", ">", "\n", " ", "`", "𝒜", "é", "_", "+"];
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let n = 0; n < 5000; n++) {
    let text = "";
    for (let i = 0, len = 1 + Math.floor(rand() * 24); i < len; i++) text += alphabet[Math.floor(rand() * alphabet.length)];
    assert.deepEqual(sorted(protectedRanges(text)), oldProtectedRanges(text), JSON.stringify(text));
  }
});

test("rangeChecker: same answers as a linear overlap test, including touching, nested and unsorted ranges", () => {
  const naive = (ranges: Range[], a: number, b: number) => ranges.some(([x, y]) => a < y && b > x);
  const cases: Range[][] = [[], [[0, 5], [5, 9]], [[0, 100], [10, 20]], [[30, 40], [0, 10], [5, 12]], [[3, 3]], [[2, 4], [4, 4], [8, 9]]];
  for (const ranges of cases) {
    const check = rangeChecker(ranges);
    for (let a = 0; a <= 101; a++) for (const b of [a, a + 1, a + 3]) {
      assert.equal(check(a, b), naive(ranges, a, b), `${JSON.stringify(ranges)} (${a}, ${b})`);
    }
  }
});

test("choice points inside a code block that contains inline code stay unchanged", () => {
  const text = "```\nca. 5 `y` ca. 5 Prozent\n```\nca. 5 Prozent";
  for (const key of ["k1", "k2", "k3", "k4"]) {
    const out = markText(text, { key }).text;
    assert.equal(out.slice(0, out.indexOf("```", 3) + 3), text.slice(0, text.indexOf("```", 3) + 3), key);
  }
});

test("quotation pairs: closer within 399 characters pairs, at 400 or after a paragraph break it does not", () => {
  const pair = (gap: string) => findQuotePairs(`„${gap}“`, []).pairs.length;
  assert.equal(pair("a".repeat(398)), 1, "closer at offset 399");
  assert.equal(pair("a".repeat(399)), 0, "closer at offset 400");
  assert.equal(pair("a\n\nb"), 0, "closer after a paragraph break");
  assert.equal(pair("a\nb"), 1, "single line break");
  assert.equal(findQuotePairs("„a `“` b“", protectedRanges("„a `“` b“")).pairs[0]?.close, 8, "protected closer skipped");
});
