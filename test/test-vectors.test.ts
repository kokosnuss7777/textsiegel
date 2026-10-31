// The test vectors (spec/test-vectors.json) must match the implementation. If the format changes, it shows up
// here – then bump the version and regenerate the vectors (node scripts/test-vectors.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublicKey } from "node:crypto";
import { markResponse, markText, verify } from "../src/cpmark.ts";
import { contentKey, encodeSignature, toDigits } from "../src/signature.ts";
import { verifyPublic } from "../src/provenance.ts";

const V = JSON.parse(readFileSync(new URL("../spec/test-vectors.json", import.meta.url), "utf8"));

test("test vectors: contentKey and base-3 encoding", () => {
  for (const v of V.contentKey) assert.equal(contentKey(v.input), v.output, v.input);
  for (const v of V.base3) assert.equal(toDigits([...Buffer.from(v.bytesHex, "hex")]), v.output, v.bytesHex);
});

test("test vectors: signature 0xF2, Choice-Point-Mark and markResponse are reproducible", () => {
  for (const v of V.signature0xF2)
    assert.equal(encodeSignature({ key: v.key, customerId: v.customerId, responseId: Buffer.from(v.responseIdHex, "hex") }, v.sentence).vs, v.marker, v.sentence);
  for (const v of V.choicePointMark) assert.equal(markText(v.input, { key: v.key }).text, v.output, v.input);
  for (const v of V.markResponse0xF2) {
    const out = markResponse(v.input, { key: v.key, signature: { customerId: v.customerId, responseId: Buffer.from(v.responseIdHex, "hex") } }).text;
    assert.equal(out, v.output, v.input);
    assert.equal(verify(out, [{ id: v.customerId, key: v.key }]).verdict, v.verdict);
  }
  for (const v of V.verify0xF2) assert.equal(verify(v.text, v.customers).verdict, v.verdict, v.description);
});

test("test vectors: public provenance 0xF3 verifiable with the public key only", async () => {
  const h = V.provenance0xF3;
  const key = createPublicKey({ key: h.publicKeyJwk, format: "jwk" });
  const r = await verifyPublic(h.text, async (id) => (id === h.record.record.responseId ? h.record : undefined), { [h.keyId]: key });
  assert.deepEqual(r, h.result);
});
