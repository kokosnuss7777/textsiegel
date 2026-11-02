// Verification service and directory (EU Code of Practice on marking and labelling of AI-generated content).
//
// - Directory: signed records by response ID (IDs, hashes, salt, timestamp only – never text).
// - Keys document for /.well-known/textsiegel-keys.json: public Ed25519 keys as JWK.
// - verify(): public provenance (verifyPublic) plus internal verification (HMAC signature, Choice-Point-Mark).
//   Submitted text is only processed in memory: not stored, not logged, not returned. Only timestamp, verdicts
//   and counts are logged (Code 2.1.3, "zero retention").
// - Report: result with content hash, service identifier and timestamp, signed with Ed25519 and downloadable
//   (Code 2.1.2). No text in the report.
// - The statistic (Choice-Point-Mark) is less reliable for free-form text and therefore only shown to expert
//   users (authorities, researchers, press, fact-checkers) (Code 2.1.2); publicly only markers count.
// - Rate limit per identifier, expert users unlimited (Code 2.1.1).

import { createHash, createPublicKey, sign, verify as verifySig, type KeyObject, type webcrypto } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verify, type Customer, type Verdict } from "./cpmark.ts";
import { canonicalJson, verifyPublic, type PublicVerdict, type PublicVerification, type SignedRecord } from "./provenance.ts";

export interface Directory {
  put(record: SignedRecord): Promise<void>;
  get(responseId: string): Promise<SignedRecord | undefined>;
}

const RESPONSE_ID = /^[0-9a-f]{16}$/;

export function memoryDirectory(): Directory {
  const map = new Map<string, SignedRecord>();
  return {
    async put(r) {
      map.set(r.record.responseId, r);
    },
    async get(id) {
      return map.get(id);
    },
  };
}

/** One JSON file per response ID; file names only from validated response IDs. */
export function fileDirectory(dir: string): Directory {
  return {
    async put(r) {
      if (!RESPONSE_ID.test(r.record.responseId)) throw new Error("invalid response ID");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${r.record.responseId}.json`), JSON.stringify(r));
    },
    async get(id) {
      if (!RESPONSE_ID.test(id)) return undefined;
      try {
        return JSON.parse(await readFile(join(dir, `${id}.json`), "utf8"));
      } catch {
        return undefined;
      }
    },
  };
}

export interface PublishedKey {
  keyId: number;
  publicKey: KeyObject;
  validFrom: string;
  /** After a rotation: until when this key was used for signing. Stays published for verification. */
  validTo?: string;
}

export interface KeysDocument {
  keys: { keyId: number; alg: "Ed25519"; jwk: webcrypto.JsonWebKey; validFrom: string; validTo?: string }[];
}

export function keysDocument(keys: PublishedKey[]): KeysDocument {
  return {
    keys: keys.map((k) => ({ keyId: k.keyId, alg: "Ed25519", jwk: k.publicKey.export({ format: "jwk" }), validFrom: k.validFrom, validTo: k.validTo })),
  };
}

/** Public keys from the keys document – for verifiers without the provider's server. */
export function publicKeysFromDocument(doc: KeysDocument): Record<number, KeyObject> {
  return Object.fromEntries(doc.keys.filter((k) => k.alg === "Ed25519").map((k) => [k.keyId, createPublicKey({ key: k.jwk, format: "jwk" })]));
}

/** Longest text (UTF-16 code units) the verification service accepts; longer texts get 413 before processing. */
export const MAX_TEXT_LENGTH = 100_000;

export const TECHNIQUE_SIGNATURE = "watermark: invisible characters, HMAC-signed";
export const TECHNIQUE_PROVENANCE = "watermark: invisible characters, Ed25519 provenance";
export const TECHNIQUE_STATISTICAL = "statistical watermark: word choice and typography";

export interface VerificationReport {
  type: "textsiegel-report";
  version: 1;
  /** URL or identifier of the verification service. */
  service: string;
  timestamp: string;
  /** SHA-256 of the submitted text (not the text itself). */
  contentHash: string;
  result: {
    verdict: string;
    techniques: string[];
    sentencesWithMarker: number;
    verified: number;
    unchanged: number;
  };
}

export interface SignedReport {
  report: VerificationReport;
  keyId: number;
  signature: string; // Ed25519, base64url over canonicalJson(report)
}

/** Check a report with the public key from the keys document. */
export function verifyReport(r: SignedReport, publicKeys: Record<number, KeyObject>): boolean {
  const key = publicKeys[r.keyId];
  if (!key || r.report?.type !== "textsiegel-report") return false;
  return verifySig(null, Buffer.from(canonicalJson(r.report)), key, Buffer.from(r.signature, "base64url"));
}

/** Sliding window per identifier (e.g. IP); expert users are exempt. */
export function createRateLimiter(o: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return {
    allow(id: string, now = Date.now(), opts: { expert?: boolean } = {}): boolean {
      if (opts.expert) return true;
      const recent = (hits.get(id) ?? []).filter((t) => now - t < o.windowMs);
      if (recent.length >= o.limit) {
        hits.set(id, recent);
        return false;
      }
      recent.push(now);
      hits.set(id, recent);
      return true;
    },
  };
}

export interface VerificationResult {
  /** Overall verdict for display: the public verdict if provenance markers were found, else the internal one. */
  verdict: PublicVerdict | Verdict;
  /** Public provenance per sentence (marker 0xF3). */
  provenance: PublicVerification;
  /** Internal verification with customer keys: HMAC signature (0xF2). */
  internal: {
    verdict: Verdict;
    signature: { found: number; valid: number; contentChecked: number; contentMatched: number; customerId?: number; responseId?: string };
  };
  /** Choice-Point-Mark as a confidence value (p-value, corrected for the number of customers) – experts only. */
  statistics: { customerId: number; points: number; matches: number; pAdjusted: number } | null;
  /** Signed, downloadable report (if a report key is configured). */
  report?: SignedReport;
}

export interface ServiceOptions {
  directory: Directory;
  keys: PublishedKey[];
  customers: Customer[];
  /** Log without text: timestamp, verdicts, counts. */
  log: (entry: { at: string; provenance: string; internal: string; markers: number; responses: number }) => void;
  /** Key for signed reports (its public part is in the keys document). */
  report?: { keyId: number; privateKey: KeyObject; service: string };
}

export function createVerificationService(o: ServiceOptions) {
  const publicKeys = Object.fromEntries(o.keys.map((k) => [k.keyId, k.publicKey]));
  return {
    keysDocument: () => keysDocument(o.keys),
    getRecord: (id: string) => o.directory.get(id),
    async verify(text: string, opts: { expert?: boolean } = {}): Promise<VerificationResult> {
      const provenance = await verifyPublic(text, (id) => o.directory.get(id), publicKeys);
      const v = verify(text, o.customers);
      const s = v.signature;
      const expert = !!opts.expert;
      // Publicly only markers count; the statistical verdict is for experts only.
      const internalVerdict: Verdict = !expert && v.verdict === "statistical" ? "none" : v.verdict;
      const verdict = provenance.sentences.length ? provenance.verdict : internalVerdict;
      const techniques = [
        ...(s.valid ? [TECHNIQUE_SIGNATURE] : []),
        ...(provenance.sentences.some((x) => x.origin) ? [TECHNIQUE_PROVENANCE] : []),
        ...(expert && v.statistic?.marked ? [TECHNIQUE_STATISTICAL] : []),
      ];
      const result: VerificationResult = {
        verdict,
        provenance,
        internal: {
          verdict: internalVerdict,
          signature: { found: s.found, valid: s.valid, contentChecked: s.contentChecked, contentMatched: s.contentMatched, customerId: s.customerId, responseId: s.responseId },
        },
        statistics: expert && v.statistic
          ? { customerId: v.statistic.customerId, points: v.statistic.points, matches: v.statistic.matches, pAdjusted: v.statistic.pAdjusted }
          : null,
      };
      if (o.report) {
        const report: VerificationReport = {
          type: "textsiegel-report", version: 1, service: o.report.service, timestamp: new Date().toISOString(),
          contentHash: `sha256:${createHash("sha256").update(text).digest("hex")}`,
          result: {
            verdict, techniques,
            sentencesWithMarker: provenance.sentences.length + s.found,
            verified: provenance.sentences.filter((x) => x.origin).length + s.valid,
            unchanged: provenance.sentences.filter((x) => x.unchanged).length + s.contentMatched,
          },
        };
        result.report = { report, keyId: o.report.keyId, signature: sign(null, Buffer.from(canonicalJson(report)), o.report.privateKey).toString("base64url") };
      }
      o.log({ at: new Date().toISOString(), provenance: provenance.verdict, internal: internalVerdict, markers: provenance.sentences.length, responses: provenance.responses.length });
      return result;
    },
  };
}
