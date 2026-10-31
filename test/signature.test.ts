import { test } from "node:test";
import assert from "node:assert/strict";
import { markResponse, markText, detect, verify, StreamMarker, stripSignature, verifySignature, SIGNATURE_RE } from "../src/cpmark.ts";
import { encodeSignature, embedSignature } from "../src/signature.ts";
import { SAMPLES } from "../demo/samples.ts";

const A = { id: 101, key: "customer-a-secret" };
const B = { id: 202, key: "customer-b-secret" };
const CUSTOMERS = [A, B];
const opts = { key: A.key, signature: { customerId: A.id } };
/** One carrier character of a signature. */
const CARRIER = /[‌‍⁠]/u;

test("signature: visible text is identical to plain Choice-Point-Mark", () => {
  for (const s of SAMPLES) {
    const signed = markResponse(s.text, opts).text;
    assert.equal(stripSignature(signed), markText(s.text, { key: A.key }).text, s.id);
  }
});

test("signature: valid, with customer and response ID", () => {
  for (const s of SAMPLES) {
    const r = markResponse(s.text, opts);
    const v = verify(r.text, CUSTOMERS);
    assert.equal(v.verdict, "signed", s.id);
    assert.equal(v.signature.customerId, A.id);
    assert.equal(v.signature.responseId, r.responseId);
    assert.ok(v.signature.valid >= 1);
  }
});

test("signature: a single copied sentence is enough", () => {
  const signed = markResponse(SAMPLES[0].text, opts).text;
  const runs = [...signed.matchAll(SIGNATURE_RE)];
  assert.ok(runs.length >= 3, `too few signatures: ${runs.length}`);
  const end = runs[1].index! + runs[1][0].length;
  const start = runs[0].index! + runs[0][0].length;
  const sentence = signed.slice(start, end).trim();
  assert.equal(verify(sentence, CUSTOMERS).verdict, "signed", sentence);
});

test("signature: wrong key or unknown customer → not valid", () => {
  const signed = markResponse(SAMPLES[0].text, opts).text;
  assert.equal(verifySignature(signed, () => "wrong-key").signed, false);
  assert.equal(verifySignature(signed, () => undefined).signed, false);
  assert.ok(verifySignature(signed, () => undefined).found > 0, "format is still recognized");
});

test("signature: tampered payload → not valid", () => {
  const { vs } = encodeSignature({ key: A.key, customerId: A.id });
  const cps = [...vs];
  cps[2] = cps[2] === "‌" ? "‍" : "‌"; // change the customer ID byte
  const forged = "Ein Satz." + cps.join("") + " Noch einer.";
  assert.equal(verifySignature(forged, (id) => (id === A.id ? A.key : B.key)).signed, false);
});

test("signature: never in code, URLs, links, email addresses or quotes", () => {
  const text = [
    "Siehe `npm test.` und https://example.de/a.b. Danach.",
    "Mail an info@example.de. Oder [Kontakt.](https://example.de/k.) lesen.",
    "Auf der Seite steht „Wir liefern schnell. Und günstig.“ So ist es.",
    "```\nconst a = 1. // Ende.\n```",
  ].join("\n\n");
  const signed = markResponse(text, opts).text;
  for (const keep of ["`npm test.`", "https://example.de/a.b", "info@example.de", "[Kontakt.](https://example.de/k.)", "Wir liefern schnell. Und günstig.", "const a = 1. // Ende."])
    assert.ok(signed.includes(keep), `changed: ${keep}`);
  assert.equal(verify(signed, CUSTOMERS).verdict, "signed");
});

test("signature: text without punctuation still gets a signature", () => {
  const signed = markResponse("Ja gerne", opts).text;
  assert.ok(CARRIER.test(signed));
  assert.equal(verify(signed, CUSTOMERS).verdict, "signed");
});

test("stream with signature: identical visible text, valid signature, same response ID", () => {
  for (const s of SAMPLES) {
    const sm = new StreamMarker(opts);
    let out = "";
    for (let i = 0; i < s.text.length; i += 7) out += sm.push(s.text.slice(i, i + 7));
    out += sm.flush();
    assert.equal(stripSignature(out), markText(s.text, { key: A.key }).text, s.id);
    const v = verify(out, CUSTOMERS);
    assert.equal(v.verdict, "signed", s.id);
    assert.equal(v.signature.responseId, sm.responseId);
    assert.equal(v.signature.responses.length, 1);
  }
});

test("statistic works independently of the signature", () => {
  const signed = markResponse(SAMPLES[0].text, opts).text;
  const stripped = stripSignature(signed);
  const v = verify(stripped, CUSTOMERS);
  assert.equal(v.signature.signed, false);
  assert.equal(v.verdict, "statistical");
  assert.equal(v.statistic?.customerId, A.id);
  assert.equal(detect(signed, { key: A.key }).pValue, detect(stripped, { key: A.key }).pValue);
});

test("per-layer detection: the lexical signal is not diluted by typography noise", () => {
  const marked = markText(SAMPLES[4].text, { key: A.key }).text;
  const retyped = marked.replace(/[  ]/g, " ").replace(/[„“”]/g, '"').replace(/ – /g, " - ");
  const d = detect(retyped, { key: A.key });
  assert.equal(d.byLayer.lexical.matches, d.byLayer.lexical.points);
  // the decision uses the best layer, so the lexical layer alone decides if typography was destroyed
  assert.ok(d.pValue <= Math.min(1, 3 * d.byLayer.lexical.pValue) + 1e-15);
});

test("unmarked text: no evidence for either customer", () => {
  for (const s of SAMPLES) assert.equal(verify(s.text, CUSTOMERS).verdict, "none", s.id);
});

test("embedSignature does not split abbreviations or ordinal numbers", () => {
  const out = embedSignature("Das gilt z. B. am 1. Mai. Fertig", "§", { atEnd: true });
  assert.equal(out, "Das gilt z. B. am 1. Mai.§ Fertig§");
});

test("signature does not break Markdown tables, thematic breaks or setext headings", () => {
  const text = [
    "Öffnungszeiten",
    "===",
    "",
    "| Tag | Zeiten |",
    "|:---|---:|",
    "| Montag bis Freitag | 8 bis 18 Uhr. Danach geschlossen |",
    "| Samstag | |",
    "",
    "Tag | Zeiten",
    "--- | ---",
    "Sonntag | geschlossen",
    "",
    "---",
    "",
    "Zwischentitel",
    "-------------",
    "",
    "* * *",
    "",
    "Zudem gilt das.",
  ].join("\n");
  const check = (signed: string) => {
    assert.equal(verify(signed, CUSTOMERS).verdict, "signed");
    for (const line of signed.split("\n")) {
      const visible = stripSignature(line);
      if (/^[\s|:-]*$/.test(visible) || /^\s*(?:[-*_=]\s*){3,}$/.test(visible))
        assert.ok(!CARRIER.test(line), `signature in delimiter line: ${visible}`);
      if (/\|\s*$/.test(visible)) assert.ok(/\|\s*$/.test(line), `signature behind the last |: ${visible}`);
    }
  };
  check(markResponse(text, opts).text);
  const sm = new StreamMarker(opts);
  let out = "";
  for (let i = 0; i < text.length; i += 5) out += sm.push(text.slice(i, i + 5));
  check(out + sm.flush());
});

test("no signature directly behind a URL at a sentence end (it would become part of the autolink)", () => {
  const text = "Mehr unter https://www.example.de/kontakt. Oder www.example.de/faq! Siehe (https://example.de/a). Danke.";
  const signed = markResponse(text, opts).text;
  for (const url of ["kontakt.", "faq!", "/a)."]) {
    const i = signed.indexOf(url) + url.length;
    assert.ok(!CARRIER.test(signed[i] ?? ""), `signature behind ${url}`);
  }
  assert.equal(verify(signed, CUSTOMERS).verdict, "signed");
  assert.equal(verify(markResponse("Siehe https://www.example.de/kontakt.", opts).text, CUSTOMERS).verdict, "signed");
});

test("signature: only ZWNJ, ZWJ and Word Joiner (Word shows variation selectors as boxes)", () => {
  for (const s of SAMPLES) {
    const signed = markResponse(s.text, opts).text;
    assert.ok(!/[\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}͏]/u.test(signed), s.id);
    for (const m of signed.matchAll(SIGNATURE_RE)) assert.match(m[0], /^[‌‍⁠]{101}$/u, s.id);
  }
});

test("signature: emoji with ZWJ and single zero-width characters in the text stay untouched", () => {
  const text = "Unser Team 👨‍👩‍👧 hilft gern. Auf‌lage und Wort⁠verbindung bleiben.";
  const signed = markResponse(text, opts).text;
  assert.equal(stripSignature(signed), markText(text, { key: A.key }).text);
  assert.ok(stripSignature(signed).includes("👨‍👩‍👧"));
  assert.equal(verify(signed, CUSTOMERS).verdict, "signed");
});

// Content binding: the signature applies to the sentence it follows (checksum over letters and digits).

test("content binding: signature moved to a foreign sentence → genuine, but altered", () => {
  const signed = markResponse("Die Lieferung dauert zwei Tage.", opts).text;
  const sig = signed.match(SIGNATURE_RE)![0];
  const v = verify("Die Erde ist eine Scheibe." + sig, CUSTOMERS);
  assert.equal(v.verdict, "signed-altered");
  assert.equal(v.signature.valid, 1);
  assert.equal(v.signature.contentMatched, 0);
});

test("content binding: edited sentence → genuine, but altered", () => {
  const signed = markResponse("Die Lieferung dauert zwei Tage.", opts).text;
  assert.equal(verify(signed.replace("zwei", "zehn"), CUSTOMERS).verdict, "signed-altered");
  assert.equal(verify(signed, CUSTOMERS).verdict, "signed");
});

test("content binding: formatting, bullets and list numbers change nothing", () => {
  const text = "## Ablauf\n\n1. Wählen Sie **Abholung vor Ort**.\n2. Wir melden uns „sofort“ – per E-Mail.\n\n- Ab 49 €: versandkostenfrei";
  const signed = markResponse(text, opts).text;
  const copied = signed.replace(/^#+ |^\d+\. |^- /gm, "").replace(/\*\*/g, "").replace(/[„“]/g, '"').replace(/ – /g, " - ").replace(/ /g, " ");
  const v = verify(copied, CUSTOMERS);
  assert.equal(v.verdict, "signed");
  assert.equal(v.signature.contentMatched, v.signature.valid);
});

test("content binding: every sentence of a response matches, also when streamed", () => {
  for (const s of SAMPLES) {
    const sm = new StreamMarker(opts);
    let out = "";
    for (let i = 0; i < s.text.length; i += 9) out += sm.push(s.text.slice(i, i + 9));
    out += sm.flush();
    const v = verify(out, CUSTOMERS);
    assert.equal(v.signature.contentMatched, v.signature.valid, s.id);
    const full = verify(markResponse(s.text, opts).text, CUSTOMERS).signature;
    assert.equal(full.contentMatched, full.valid, s.id);
  }
});

test("content binding: a copied sentence preceded by foreign text stays valid", () => {
  const signed = markResponse("Erster Satz hier. Die Ware liegt 5 Tage bereit. Danke.", opts).text;
  const runs = [...signed.matchAll(SIGNATURE_RE)];
  const sentence = signed.slice(runs[0].index! + runs[0][0].length, runs[1].index! + runs[1][0].length).trim();
  const v = verify(`Notiz von mir: ${sentence}`, CUSTOMERS);
  assert.equal(v.verdict, "signed");
});
