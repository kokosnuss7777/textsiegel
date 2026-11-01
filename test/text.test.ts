// Protected-range detection runs on every public check, so it must stay linear in the text length (ticket 02).

import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { blockedRanges, protectedRanges } from "../src/text.ts";
import { verify } from "../src/cpmark.ts";

const N = 50_000;
// Inputs that made a backtracking pattern scan again from every start position.
const HOSTILE: Record<string, string> = {
  letters: "a".repeat(N),
  dots: "a.".repeat(N / 2),
  hyphens: "a-".repeat(N / 2),
  "e-mail local part without domain": `${"a".repeat(N)}@`,
  "e-mail domain without dot": `a@${"b".repeat(N)}`,
  "e-mail domain without final letter": `a@b.${"1".repeat(N)}`,
  "url without end": `https://${"a".repeat(N)}`,
  "unclosed inline code": `\`${"a".repeat(N)}`,
  "unclosed link": `[${"a".repeat(N)}`,
  "unclosed link target": `[a](${"b".repeat(N)}`,
  "unclosed html tag": `<${"a".repeat(N)}`,
  "unclosed fence": `\`\`\`${"a".repeat(N)}`,
  "many backticks": "`".repeat(N),
  "many brackets": "[".repeat(N),
  "many angle brackets": "<".repeat(N),
  "many opening quotes": "„a ".repeat(N / 3),
  "opening quotes between code spans": "„a `b` ".repeat(N / 7),
};

// Inputs with a choice point every few characters: verification scans all of them.
const DENSE: Record<string, string> = {
  approximately: "ca. 5 ".repeat(N / 6),
  furthermore: "zudem ".repeat(N / 6),
  percent: "5 % ".repeat(N / 4),
  dash: "a - ".repeat(N / 4),
  "choice points between code spans": "ca. 5 `x` ".repeat(N / 10),
  quotes: "„a“ ".repeat(N / 4),
};

function ms(fn: () => void): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

test("protected ranges: linear on hostile input (50,000 characters in well under 100 ms)", () => {
  for (const [name, s] of Object.entries(HOSTILE)) {
    const t = ms(() => blockedRanges(s));
    assert.ok(t < 100, `${name}: ${t.toFixed(0)} ms`);
  }
});

test("verification: hostile and choice-point-dense input of 50,000 characters is checked in under a second", () => {
  const customers = [{ id: 101, key: "customer-a-secret" }];
  const inputs = { letters: HOSTILE.letters, dots: HOSTILE.dots, hyphens: HOSTILE.hyphens, ...DENSE };
  for (const [name, s] of Object.entries(inputs)) {
    const t = ms(() => verify(s, customers));
    assert.ok(t < 1000, `${name}: ${t.toFixed(0)} ms`);
  }
});

// The pattern before ticket 02, kept as the reference for short inputs where its backtracking does not matter.
const OLD_EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+\.[\p{L}\p{N}.-]*\p{L}/gu;

test("e-mail addresses: same matches as the previous pattern", () => {
  const texts = [
    "Schreiben Sie an info@example.org.",
    "Mail: max.mustermann+shop@sub.beispiel-shop.de, danke",
    "Kontakt: jürgen@müller.de!",
    "a@b.c1 und x@y.z",
    "Preis 5@home ist kein Kontakt",
    "two: a@b.de c@d.com",
    "user@@example.org",
    "a@b@c.de",
    "-._%+@x-y.z9.de- und @nur.domain",
    "name@domain.",
    "name@domain.c-",
    "name@domain.co.uk.",
    "x@y.zz.11",
  ];
  for (const text of texts) {
    const expected = [...text.matchAll(OLD_EMAIL)].map((m) => m[0]);
    const found = protectedRanges(text).map(([a, b]) => text.slice(a, b)).filter((x) => x.includes("@"));
    assert.deepEqual(found, expected, text);
  }
});
