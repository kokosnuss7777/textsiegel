// Publicly verifiable provenance (marker 0xF3): anyone can verify with the public Ed25519 key and the record
// from the directory, without the provider's secret.
//
// Marker per sentence (16 bytes, 81 characters of ZWNJ/ZWJ/Word Joiner, like the HMAC signature):
//   version 0xF3 | key ID (1) | response ID (8) | sentence number (2) | sentence hash (4)
// sentence hash = trunc32(SHA-256(salt ‖ contentKey(sentence))) over the delivered sentence (after Choice-Point-Mark).
// No HMAC in the marker: authenticity comes from the signed record, content binding from the sentence hash.
// A forged marker points to no response, or its hash is not in the signed record.
//
// Record (canonical JSON, sorted keys, signed with Ed25519) – never contains text:
//   { v, keyId, responseId, customer, createdAt, salt, model?, sentenceHashes[] }
// The salt is public: it prevents precomputed tables, but not guessing very short stock sentences
// ("Ja, gerne.") from their hash.

import { createHash, createPublicKey, randomBytes, sign, verify, type KeyObject } from "node:crypto";
import { contentKey, fromRun, scanMarkers, sentenceCandidates, toDigits } from "./signature.ts";

const VERSION = 0xf3;
const MARKER_LEN = 16;

export interface ProvenanceRecord {
  v: 3;
  keyId: number;
  responseId: string; // 8 bytes hex
  customer: string; // pseudonymous
  createdAt: string;
  salt: string; // 16 bytes hex
  model?: string;
  sentenceHashes: string[]; // 4 bytes hex each, index = sentence number
}

export interface SignedRecord {
  record: ProvenanceRecord;
  signature: string; // Ed25519, base64url over canonicalJson(record)
}

/** Canonical JSON: sorted keys, no whitespace (for JSON data as in RFC 8785). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function sentenceHash(salt: Buffer, sentence: string): Buffer {
  return createHash("sha256").update(salt).update(contentKey(sentence)).digest().subarray(0, 4);
}

export interface ProvenanceOptions {
  keyId: number;
  privateKey: KeyObject;
  /** Pseudonymous customer identifier in the public record. */
  customer: string;
  model?: string;
}

export interface Provenance {
  readonly responseId: string;
  /** Marker for the next sentence (increments the sentence number, collects the hash). */
  sign(sentence: string): string;
  /** Sign the record for all sentences marked so far – also after an aborted stream. */
  finish(): SignedRecord;
}

/** Provenance for one response: response ID and salt are fixed from the first sentence on. */
export function createProvenance(o: ProvenanceOptions): Provenance {
  if (o.keyId < 0 || o.keyId > 255) throw new Error("keyId must be 0–255");
  const rid = randomBytes(8);
  const salt = randomBytes(16);
  const createdAt = new Date().toISOString();
  const hashes: Buffer[] = [];
  return {
    responseId: rid.toString("hex"),
    sign(sentence) {
      if (hashes.length > 0xffff) throw new Error("too many sentences for one record");
      const h = sentenceHash(salt, sentence);
      const bytes = Buffer.alloc(MARKER_LEN);
      bytes[0] = VERSION;
      bytes[1] = o.keyId;
      rid.copy(bytes, 2);
      bytes.writeUInt16BE(hashes.length, 10);
      h.copy(bytes, 12);
      hashes.push(h);
      return toDigits([...bytes]);
    },
    finish() {
      const record: ProvenanceRecord = {
        v: 3, keyId: o.keyId, responseId: rid.toString("hex"), customer: o.customer, createdAt,
        salt: salt.toString("hex"), ...(o.model ? { model: o.model } : {}), sentenceHashes: hashes.map((h) => h.toString("hex")),
      };
      return { record, signature: sign(null, Buffer.from(canonicalJson(record)), o.privateKey).toString("base64url") };
    },
  };
}

export interface SentenceResult {
  responseId: string;
  sentenceNo: number;
  /** Record found, Ed25519 signature valid, marker hash listed in the record. */
  origin: boolean;
  /** The sentence before the marker matches the hash in the record. */
  unchanged: boolean;
}

/**
 * "verified": origin confirmed and at least one sentence unchanged; "altered": origin confirmed, text changed or
 * marker moved; "unverified": markers in the format, origin not confirmed; "none": no marker.
 */
export type PublicVerdict = "verified" | "altered" | "unverified" | "none";

export interface PublicVerification {
  sentences: SentenceResult[];
  responses: { responseId: string; origin: boolean; customer?: string; createdAt?: string; model?: string }[];
  verdict: PublicVerdict;
}

/**
 * Verify a text using public keys and records only. `fetchRecord` loads the record for a response ID
 * (directory, file, cache). The text is only processed in memory.
 */
export async function verifyPublic(
  text: string,
  fetchRecord: (responseId: string) => Promise<SignedRecord | undefined>,
  publicKeys: Record<number, KeyObject | string>,
): Promise<PublicVerification> {
  const { plain, markers } = scanMarkers(text);
  const records = new Map<string, ProvenanceRecord | null>(); // null = missing or invalid
  const sentences: SentenceResult[] = [];
  for (const { run, pos, prev } of markers) {
    const bytes = Buffer.from(fromRun(run));
    if (bytes.length !== MARKER_LEN || bytes[0] !== VERSION) continue;
    const keyId = bytes[1];
    const responseId = bytes.subarray(2, 10).toString("hex");
    const sentenceNo = bytes.readUInt16BE(10);
    const markerHash = bytes.subarray(12, 16).toString("hex");
    if (!records.has(responseId)) records.set(responseId, await loadRecord(responseId, keyId, fetchRecord, publicKeys));
    const record = records.get(responseId);
    const origin = !!record && record.keyId === keyId && record.sentenceHashes[sentenceNo] === markerHash;
    const salt = Buffer.from(record?.salt ?? "", "hex");
    const unchanged = origin && sentenceCandidates(plain, pos, prev).some((c) => sentenceHash(salt, c).toString("hex") === markerHash);
    sentences.push({ responseId, sentenceNo, origin, unchanged });
  }
  const responses = [...records].map(([responseId, r]) => ({
    responseId, origin: !!r && sentences.some((s) => s.responseId === responseId && s.origin),
    customer: r?.customer, createdAt: r?.createdAt, model: r?.model,
  }));
  const verdict: PublicVerdict = !sentences.length ? "none"
    : !sentences.some((s) => s.origin) ? "unverified"
    : sentences.some((s) => s.unchanged) ? "verified"
    : "altered";
  return { sentences, responses, verdict };
}

async function loadRecord(
  responseId: string,
  keyId: number,
  fetchRecord: (responseId: string) => Promise<SignedRecord | undefined>,
  publicKeys: Record<number, KeyObject | string>,
): Promise<ProvenanceRecord | null> {
  const signed = await fetchRecord(responseId);
  const key = publicKeys[keyId];
  if (!signed || !key || signed.record.responseId !== responseId || signed.record.keyId !== keyId) return null;
  const pub = typeof key === "string" ? createPublicKey(key) : key;
  const ok = verify(null, Buffer.from(canonicalJson(signed.record)), pub, Buffer.from(signed.signature, "base64url"));
  return ok ? signed.record : null;
}
