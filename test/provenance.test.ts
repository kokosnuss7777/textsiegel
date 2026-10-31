import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { markResponse, markText, StreamMarker, stripSignature, SIGNATURE_RE } from "../src/cpmark.ts";
import { createProvenance, verifyPublic, canonicalJson, type SignedRecord } from "../src/provenance.ts";
import { SAMPLES } from "../demo/samples.ts";

const KEY = "customer-a-secret"; // Choice-Point-Mark (HMAC) key
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const other = generateKeyPairSync("ed25519");
const PUBLIC_KEYS = { 1: publicKey };

/** In-memory directory: response ID → signed record. */
function directory(...records: SignedRecord[]) {
  const map = new Map(records.map((r) => [r.record.responseId, structuredClone(r)]));
  return { fetchRecord: async (id: string) => map.get(id), map };
}

function answer(text: string) {
  const provenance = createProvenance({ keyId: 1, privateKey, customer: "customer-7f3a", model: "Qwen3.8-27B-NVFP4" });
  const r = markResponse(text, { key: KEY, provenance });
  return { text: r.text, record: provenance.finish() };
}

const TEXT = "Die Lieferung dauert zwei Tage. Bestellungen bis 14 Uhr verschicken wir am selben Tag. Danke für Ihre Bestellung.";

test("marker 0xF3: 81 characters of ZWNJ/ZWJ/Word Joiner, visible text unchanged", () => {
  for (const s of SAMPLES) {
    const { text } = answer(s.text);
    assert.equal(stripSignature(text), markText(s.text, { key: KEY }).text, s.id);
    for (const m of text.matchAll(SIGNATURE_RE)) assert.match(m[0], /^[‌‍⁠]{81}$/u, s.id);
  }
});

test("record: no text, only hashes; canonical and signed with Ed25519", () => {
  const { record } = answer(TEXT);
  assert.equal(record.record.sentenceHashes.length, 3);
  assert.ok(!JSON.stringify(record).includes("Lieferung"), "no plain text in the record");
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: "x" }] }), '{"a":[2,{"c":"x","d":3}],"b":1}');
});

test("whole response: origin and unchanged, with public key and directory only", async () => {
  const { text, record } = answer(TEXT);
  const v = await verifyPublic(text, directory(record).fetchRecord, PUBLIC_KEYS);
  assert.equal(v.verdict, "verified");
  assert.equal(v.sentences.length, 3);
  assert.ok(v.sentences.every((s) => s.origin && s.unchanged));
  assert.equal(v.responses[0].customer, "customer-7f3a");
});

test("partial copy of one sentence → origin and unchanged", async () => {
  const { text, record } = answer(TEXT);
  const runs = [...text.matchAll(SIGNATURE_RE)];
  const second = text.slice(runs[0].index! + runs[0][0].length, runs[1].index! + runs[1][0].length).trim();
  const v = await verifyPublic(`Laut Chatbot: ${second}`, directory(record).fetchRecord, PUBLIC_KEYS);
  assert.equal(v.sentences.length, 1);
  assert.deepEqual([v.sentences[0].origin, v.sentences[0].unchanged, v.sentences[0].sentenceNo], [true, true, 1]);
});

test("moved marker → origin yes, unchanged no; word changed → unchanged no", async () => {
  const { text, record } = answer(TEXT);
  const dir = directory(record).fetchRecord;
  const marker = text.match(SIGNATURE_RE)![0];
  const moved = await verifyPublic("Die Erde ist eine Scheibe." + marker, dir, PUBLIC_KEYS);
  assert.deepEqual([moved.sentences[0].origin, moved.sentences[0].unchanged], [true, false]);
  assert.equal(moved.verdict, "altered");
  const edited = await verifyPublic(text.replace("zwei", "zehn"), dir, PUBLIC_KEYS);
  assert.deepEqual(edited.sentences.map((s) => s.unchanged), [false, true, true]);
});

test("typography, spaces and Markdown normalized → still unchanged", async () => {
  const src = "## Ablauf\n\n1. Wählen Sie **Abholung vor Ort** – ca. 5 Minuten.\n2. Wir melden uns „sofort“ per E-Mail.";
  const { text, record } = answer(src);
  const copied = text.replace(/^#+ |^\d+\. /gm, "").replace(/\*\*/g, "").replace(/[„“]/g, '"').replace(/ – /g, " - ").replace(/[  ]/g, " ");
  const v = await verifyPublic(copied, directory(record).fetchRecord, PUBLIC_KEYS);
  assert.ok(v.sentences.length >= 2);
  assert.ok(v.sentences.every((s) => s.origin && s.unchanged));
});

test("tampered record, wrong key, unknown response → no origin", async () => {
  const { text, record } = answer(TEXT);
  const dir = directory(record);
  dir.map.get(record.record.responseId)!.record.sentenceHashes[0] = "00000000";
  assert.ok((await verifyPublic(text, dir.fetchRecord, PUBLIC_KEYS)).sentences.every((s) => !s.origin));
  assert.ok((await verifyPublic(text, directory(record).fetchRecord, { 1: other.publicKey })).sentences.every((s) => !s.origin));
  const none = await verifyPublic(text, async () => undefined, PUBLIC_KEYS);
  assert.equal(none.verdict, "unverified");
});

test("forged marker (sentence hash changed) → no origin", async () => {
  const { text, record } = answer("Ein einziger Satz.");
  const run = text.match(SIGNATURE_RE)![0];
  const chars = [...run];
  chars[80] = chars[80] === "‌" ? "‍" : "‌"; // last digit = sentence hash
  const v = await verifyPublic(text.replace(run, chars.join("")), directory(record).fetchRecord, PUBLIC_KEYS);
  assert.equal(v.sentences[0]?.origin ?? false, false);
});

test("stream: same visible text; aborted stream → record for the emitted sentences", async () => {
  for (const s of SAMPLES) {
    const provenance = createProvenance({ keyId: 1, privateKey, customer: "customer-7f3a" });
    const sm = new StreamMarker({ key: KEY, provenance });
    let out = "";
    for (let i = 0; i < s.text.length; i += 7) out += sm.push(s.text.slice(i, i + 7));
    out += sm.flush();
    assert.equal(stripSignature(out), markText(s.text, { key: KEY }).text, s.id);
    const v = await verifyPublic(out, directory(provenance.finish()).fetchRecord, PUBLIC_KEYS);
    assert.ok(v.sentences.length > 0 && v.sentences.every((x) => x.origin && x.unchanged), s.id);
  }
  const provenance = createProvenance({ keyId: 1, privateKey, customer: "customer-7f3a" });
  const sm = new StreamMarker({ key: KEY, provenance });
  const partial = sm.push("Erster Satz ist fertig. Zweiter Satz auch. Dritter Sa");
  const record = provenance.finish(); // the stream aborts here, no flush()
  assert.equal(record.record.sentenceHashes.length, 2);
  const v = await verifyPublic(partial, directory(record).fetchRecord, PUBLIC_KEYS);
  assert.ok(v.sentences.every((x) => x.origin && x.unchanged));
});

test("unmarked text: no marker, no false positive", async () => {
  for (const s of SAMPLES) assert.equal((await verifyPublic(s.text, async () => undefined, PUBLIC_KEYS)).verdict, "none");
});
