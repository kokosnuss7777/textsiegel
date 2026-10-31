import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markResponse, markText } from "../src/cpmark.ts";
import { createProvenance, verifyPublic, type SignedRecord } from "../src/provenance.ts";
import {
  createRateLimiter, createVerificationService, fileDirectory, keysDocument, memoryDirectory, publicKeysFromDocument,
  verifyReport, TECHNIQUE_SIGNATURE,
} from "../src/service.ts";

const CUSTOMER = { id: 101, key: "customer-a-secret" };
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const KEYS = [{ keyId: 1, publicKey, validFrom: "2026-10-31T00:00:00Z" }];
const TEXT = "Die Lieferung dauert zwei Tage. Bestellungen bis 14 Uhr verschicken wir am selben Tag.";

function publicAnswer(text = TEXT) {
  const provenance = createProvenance({ keyId: 1, privateKey, customer: "customer-7f3a" });
  const r = markResponse(text, { key: CUSTOMER.key, provenance });
  return { text: r.text, record: provenance.finish() };
}

function serviceWith(directory = memoryDirectory()) {
  return createVerificationService({
    directory, keys: KEYS, customers: [CUSTOMER], log: () => {},
    report: { keyId: 1, privateKey, service: "https://verify.example.org/v1/verify" },
  });
}

test("directory in memory and as files: store and load", async () => {
  const { record } = publicAnswer();
  const mem = memoryDirectory();
  await mem.put(record);
  assert.deepEqual(await mem.get(record.record.responseId), record);
  const dir = mkdtempSync(join(tmpdir(), "textsiegel-directory-"));
  try {
    const files = fileDirectory(dir);
    await files.put(record);
    assert.deepEqual(await files.get(record.record.responseId), record);
    assert.equal(await files.get("../../etc/passwd"), undefined, "only response IDs as file names");
    assert.equal(await files.get("0000000000000000"), undefined);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("keys document (/.well-known): JWK round trip, usable with verifyPublic", async () => {
  const doc = keysDocument(KEYS);
  assert.equal(doc.keys[0].alg, "Ed25519");
  assert.ok(!JSON.stringify(doc).includes("PRIVATE"), "no private key");
  const { text, record } = publicAnswer();
  const keys = publicKeysFromDocument(JSON.parse(JSON.stringify(doc)));
  const v = await verifyPublic(text, async (id) => (id === record.record.responseId ? record : undefined), keys);
  assert.equal(v.verdict, "verified");
});

test("service: public provenance and internal verification in one result", async () => {
  const directory = memoryDirectory();
  const { text, record } = publicAnswer();
  await directory.put(record);
  const service = createVerificationService({ directory, keys: KEYS, customers: [CUSTOMER], log: () => {} });
  const r = await service.verify(text, { expert: true });
  assert.equal(r.provenance.verdict, "verified");
  assert.equal(r.provenance.sentences.length, 2);
  assert.equal(r.statistics?.customerId, CUSTOMER.id);

  const hmac = markResponse(TEXT, { key: CUSTOMER.key, signature: { customerId: CUSTOMER.id } }).text;
  const r2 = await service.verify(hmac);
  assert.equal(r2.provenance.verdict, "none");
  assert.equal(r2.internal.verdict, "signed");
  assert.equal(r2.verdict, "signed");
});

test("service neither stores nor logs submitted text", async () => {
  const directory = memoryDirectory();
  const { text, record } = publicAnswer();
  await directory.put(record);
  const stored: SignedRecord[] = [];
  const spy = { put: async (r: SignedRecord) => void stored.push(r), get: directory.get };
  const logged: unknown[] = [];
  const service = createVerificationService({ directory: spy, keys: KEYS, customers: [CUSTOMER], log: (e) => logged.push(e) });
  const foreign = "Vertrauliche Notiz über Familie Mustermann in Bielefeld.";
  const result = await service.verify(`${foreign} ${text}`);
  assert.equal(stored.length, 0, "verifying writes nothing to the directory");
  assert.equal(logged.length, 1);
  const all = JSON.stringify(logged) + JSON.stringify(result);
  for (const word of ["Vertrauliche", "Mustermann", "Bielefeld", "Lieferung", "Bestellungen"])
    assert.ok(!all.includes(word), `text in log or result: ${word}`);
});

// Code of Practice 2.1.1–2.3: signed report, statistic for experts only, rate limit with exemptions

test("report: signed, with content hash, service identifier and timestamp – without text", async () => {
  const hmac = markResponse(TEXT, { key: CUSTOMER.key, signature: { customerId: CUSTOMER.id } }).text;
  const r = await serviceWith().verify(hmac);
  const rep = r.report!.report;
  assert.equal(rep.type, "textsiegel-report");
  assert.equal(rep.service, "https://verify.example.org/v1/verify");
  assert.match(rep.contentHash, /^sha256:[0-9a-f]{64}$/);
  assert.ok(!Number.isNaN(Date.parse(rep.timestamp)));
  assert.equal(rep.result.verdict, "signed");
  assert.ok(rep.result.techniques.includes(TECHNIQUE_SIGNATURE));
  assert.ok(!JSON.stringify(r.report).includes("Lieferung"));
  assert.equal(verifyReport(r.report!, { 1: publicKey }), true);
  const forged = structuredClone(r.report!);
  forged.report.result.verdict = "none";
  assert.equal(verifyReport(forged, { 1: publicKey }), false);
});

test("statistic (Choice-Point-Mark) for experts only; public result without p-value", async () => {
  const marked = markText(TEXT + " Zudem liefern wir ca. 5 Tage später gerne kostenlos.", { key: CUSTOMER.key }).text;
  const service = serviceWith();
  const pub = await service.verify(marked);
  assert.equal(pub.statistics, null);
  assert.notEqual(pub.verdict, "statistical");
  assert.ok(!JSON.stringify(pub).includes("pAdjusted"));
  const expert = await service.verify(marked, { expert: true });
  assert.ok(expert.statistics && typeof expert.statistics.pAdjusted === "number");
});

test("rate limit: per identifier, experts unlimited", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
  const now = 1_000_000;
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.allow("ip-a", now)), [true, true, true, false]);
  assert.equal(limiter.allow("ip-b", now), true, "other identifier is independent");
  assert.equal(limiter.allow("ip-a", now + 60_001), true, "new time window");
  assert.ok(Array.from({ length: 50 }, () => limiter.allow("ip-c", now, { expert: true })).every(Boolean));
});
