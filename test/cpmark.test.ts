import { test } from "node:test";
import assert from "node:assert/strict";
import { markText, detect, StreamMarker } from "../src/cpmark.ts";
import { SAMPLES } from "../demo/samples.ts";

const KEYS = ["customer-a-secret", "customer-b-secret", "customer-c-secret"];

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("idempotent: marking twice changes nothing", () => {
  for (const key of KEYS)
    for (const s of SAMPLES) {
      const once = markText(s.text, { key }).text;
      assert.equal(markText(once, { key }).text, once, `${s.id} / ${key}`);
    }
});

test("marked text: every choice point is a hit", () => {
  for (const key of KEYS)
    for (const s of SAMPLES) {
      const d = detect(markText(s.text, { key }).text, { key });
      assert.equal(d.matches, d.points, `${s.id} / ${key}`);
    }
});

test("streamed marking is identical to marking the whole text", () => {
  const rand = rng(42);
  for (const key of KEYS)
    for (const s of SAMPLES) {
      const expected = markText(s.text, { key }).text;
      for (let run = 0; run < 150; run++) {
        const sm = new StreamMarker({ key });
        let out = "";
        let i = 0;
        while (i < s.text.length) {
          const n = 1 + Math.floor(rand() * 25);
          out += sm.push(s.text.slice(i, i + n));
          i += n;
        }
        out += sm.flush();
        assert.equal(out, expected, `${s.id} / ${key} / run ${run}`);
      }
    }
});

test("stream emits text before the end (sentence by sentence)", () => {
  const sm = new StreamMarker({ key: KEYS[0] });
  const first = sm.push("Die Lieferung dauert ca. 3 Tage. Danach ");
  assert.ok(first.length > 0, "something should be emitted after the first sentence");
  assert.ok(!sm.push("z.").includes("z."), "„z.“ alone is not a sentence end");
});

test("false positives: unmarked text with random keys", () => {
  let total = 0;
  let hits01 = 0;
  let hitsAlpha = 0;
  for (const s of SAMPLES)
    for (let k = 0; k < 400; k++) {
      const d = detect(s.text, { key: `random-${k}` });
      total++;
      if (d.pValue < 0.01) hits01++;
      if (d.marked) hitsAlpha++;
    }
  // p-values are discrete and conservative: the share with p < 0.01 must not exceed ~1 %.
  assert.ok(hits01 / total <= 0.015, `share p<0.01: ${hits01}/${total}`);
  assert.equal(hitsAlpha, 0, "no false positive at alpha = 1e-4");
});

test("a foreign key does not detect the marking", () => {
  const marked = markText(SAMPLES[0].text, { key: "customer-a-secret" }).text;
  assert.equal(detect(marked, { key: "customer-a-secret" }).marked, true);
  assert.equal(detect(marked, { key: "customer-b-secret" }).marked, false);
});

test("protected ranges stay unchanged", () => {
  const text = [
    "Zudem gilt: `zudem z. B. 5 %` bleibt Code.",
    "```\nconst x = \"zudem\"; // ca. 5 €\n```",
    "Mehr unter https://example.de/zudem-z.B.-5%25 und [außerdem gerne](https://example.de/gerne).",
    "Schreiben Sie an zudem.gerne@example.de, außerdem gerne.",
    "Auf der Website steht „Wir liefern zudem ca. 5 Tage und gerne kostenlos“ wörtlich.",
    "<span title=\"zudem\">außerdem</span>",
  ].join("\n\n");
  for (const key of KEYS) {
    const out = markText(text, { key }).text;
    for (const keep of [
      "`zudem z. B. 5 %`",
      'const x = "zudem"; // ca. 5 €',
      "https://example.de/zudem-z.B.-5%25",
      "[außerdem gerne](https://example.de/gerne)",
      "zudem.gerne@example.de",
      "Wir liefern zudem ca. 5 Tage und gerne kostenlos",
      '<span title="zudem">',
    ])
      assert.ok(out.includes(keep), `missing: ${keep}`);
  }
});

test("numbers, amounts and facts stay the same", () => {
  const numbers = (t: string) =>
    (t.replace(/:00(?=[   ]Uhr)/g, "").match(/\d+(?:[.,]\d+)*/g) ?? []).join("|");
  for (const key of KEYS)
    for (const s of SAMPLES) assert.equal(numbers(markText(s.text, { key }).text), numbers(s.text), s.id);
});

test("an abbreviation at a sentence end is not touched", () => {
  const text = "Bitte melden Sie sich ggf. Ihr Team hilft. Wir liefern Äpfel, Birnen usw. Danke.";
  for (const key of KEYS) {
    const out = markText(text, { key }).text;
    assert.ok(out.includes("ggf. Ihr"), out);
  }
});

test("„ca.“ only counts before a number", () => {
  const d = detect("Das dauert ca. Wochen, ca. 5 Tage.", { key: KEYS[0] });
  assert.equal(d.details.filter((p) => p.classId === "approximately").length, 1);
});

test("capitalization at sentence start is kept, no abbreviation at sentence start", () => {
  for (let k = 0; k < 50; k++) {
    const out = markText("Zum Beispiel gilt das. Zudem gilt das.", { key: `k${k}` }).text;
    assert.match(out, /^(Zum Beispiel|Beispielsweise) gilt das\. (Zudem|Außerdem) gilt das\.$/);
  }
});

test("„Beachten Sie bitte“ only at sentence start", () => {
  for (let k = 0; k < 30; k++) {
    const out = markText("Hinweis: bitte beachten Sie die Frist. Bitte beachten Sie die Frist.", { key: `k${k}` }).text;
    assert.ok(out.startsWith("Hinweis: bitte beachten Sie die Frist."), out);
  }
});

test("consistent formatting within a text", () => {
  const text = "Wir haben von 8 bis 12 Uhr und von 14 bis 18 Uhr geöffnet – samstags bis 13 Uhr – sonst geschlossen.";
  for (let k = 0; k < 30; k++) {
    const out = markText(text, { key: `k${k}` }).text;
    const withColon = (out.match(/\d:00[  ]Uhr/g) ?? []).length;
    assert.ok(withColon === 0 || withColon === 3, out);
    assert.ok(!(out.includes(" – ") && out.includes(" - ")), out);
  }
});
