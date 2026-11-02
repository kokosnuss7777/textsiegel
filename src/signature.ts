// Signature layer: an invisible, HMAC-signed response ID behind every sentence end.
//
// Encoding: base 3 with ZWNJ (U+200C) = 0, ZWJ (U+200D) = 1, Word Joiner (U+2060) = 2.
// Chosen after the character, run and carrier tests of the test page: all three are invisible in Word for Mac
// and survive Gmail and Outlook Web singly, as runs of 17 and mixed. Word shows variation selectors as boxes,
// Outlook Web removes VS17–VS256, Gmail removes runs of 8+ variation selectors or CGJ.
//
// Payload (20 bytes, 101 characters):
//   version 0xF2 | customer ID (4) | response ID (6) | content (3) | HMAC (6)
// "content" is a checksum over the sentence before the signature (letters and digits only, without list
// and heading markers): a signature behind foreign or edited text is still recognized as genuine, but the
// verifier reports "signed-altered". Formatting, quotation marks, space types and Markdown do not change it.
// Forging without the key: probability 2^-48 per attempt.

import { createHmac, randomBytes } from "node:crypto";
import { blockedRanges, endsWithSentenceEnd, rangeChecker } from "./text.ts";

const VERSION = 0xf2;
const PAYLOAD_LEN = 20;
const DIGITS = ["\u200C", "\u200D", "\u2060"]; // ZWNJ, ZWJ, Word Joiner
/** Characters per marker → bytes: ⌈bits / log2(3)⌉. */
const DIGIT_LENGTHS: Record<number, number> = { 101: 20, 81: 16 };
/**
 * A signature/marker or a remnant of one: a run of 8+ carrier characters – single ZWJ in emoji or ZWNJ in
 * running text stay untouched.
 */
export const SIGNATURE_RE = /[\u200C\u200D\u2060]{8,}/gu;

export interface SignatureOptions {
  key: string;
  customerId: number;
  /** 6 bytes; random if omitted. */
  responseId?: Uint8Array;
}

function mac(key: string, body: Uint8Array): Buffer {
  return createHmac("sha256", key).update("textsiegel-signatur-v1").update(body).digest().subarray(0, 6);
}

/** Sentence content for checksums: without leading list/heading markers, letters and digits only. */
export function contentKey(sentence: string): string {
  return sentence
    .normalize("NFKC")
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)+/, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Checksum over customer ID, response ID and sentence content (3 bytes). */
function contentTag(key: string, ids: Uint8Array, sentence: string): Buffer {
  return createHmac("sha256", key).update("textsiegel-inhalt-v1").update(ids).update(contentKey(sentence)).digest().subarray(0, 3);
}

/** Start of the sentence ending at `end`: after the previous sentence or line end. */
function sentenceStart(s: string, end: number): number {
  for (let i = end - 1; i >= 0; i--) {
    if (s[i] === "\n") return i + 1;
    if (/\s/.test(s[i]) && endsWithSentenceEnd(s.slice(Math.max(0, i - 40), i))) return i + 1;
  }
  return 0;
}

/** Bytes as a run of the three carriers (base 3, fixed length per payload size). */
export function toDigits(bytes: number[]): string {
  const len = Object.keys(DIGIT_LENGTHS).map(Number).find((n) => DIGIT_LENGTHS[n] === bytes.length)!;
  let n = bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    out.unshift(DIGITS[Number(n % 3n)]);
    n /= 3n;
  }
  return out.join("");
}

/** Bytes from a run of the three carriers (base 3); empty if the length matches no payload. */
export function fromRun(run: string): number[] {
  const chars = [...run];
  const len = DIGIT_LENGTHS[chars.length];
  if (!len || !chars.every((ch) => DIGITS.includes(ch))) return [];
  let n = chars.reduce((acc, ch) => acc * 3n + BigInt(DIGITS.indexOf(ch)), 0n);
  if (n >> BigInt(len * 8)) return [];
  const out: number[] = [];
  for (let i = 0; i < len; i++, n >>= 8n) out.unshift(Number(n & 255n));
  return out;
}

/** Payload as an invisible string for the sentence `sentence`. */
export function encodeSignature(o: SignatureOptions, sentence = ""): { vs: string; responseId: string } {
  const rid = o.responseId ?? randomBytes(6);
  if (rid.length !== 6) throw new Error("responseId must be 6 bytes long");
  const body = new Uint8Array(14);
  body[0] = VERSION;
  new DataView(body.buffer).setUint32(1, o.customerId >>> 0);
  body.set(rid, 5);
  body.set(contentTag(o.key, body.subarray(1, 11), sentence), 11);
  return { vs: toDigits([...body, ...mac(o.key, body)]), responseId: Buffer.from(rid).toString("hex") };
}

/** Remove signatures and markers, including remnants (the visible text stays identical). */
export function stripSignature(text: string): string {
  return text.replace(SIGNATURE_RE, "");
}

/**
 * Insert position for the line end at `end` – or null if a character there would break Markdown: table
 * delimiter rows, thematic breaks and setext underlines get no signature; if the line ends with "|" (table
 * row), the signature goes into the last cell instead of behind it.
 */
function lineEndPosition(s: string, end: number): number | null {
  const start = s.lastIndexOf("\n", end - 1) + 1;
  const line = s.slice(start, end);
  if (/^ {0,3}(?:[-*_=] *){3,}$/.test(line) || (/^[\s|:-]*$/.test(line) && /\|/.test(line) && /-/.test(line))) return null;
  // Same position as /\s*\|\s*$/ – without the regex, which retries every whitespace start on a long line.
  const trimmed = line.trimEnd();
  if (!trimmed.endsWith("|")) return end;
  return start + trimmed.slice(0, -1).trimEnd().length;
}

/**
 * Insert a signature behind every sentence end and line end in `text` – never in code, URLs, links, HTML,
 * email addresses or quotes. `prefix` is text already emitted (without signatures) as context. With `atEnd`,
 * the end of `text` counts as a sentence/line end (stream segments). `vs` is the signature or a function
 * that creates it from the sentence before the insert position.
 */
export function embedSignature(
  text: string,
  vs: string | ((sentence: string) => string),
  opts: { prefix?: string; atEnd?: boolean } = {},
): string {
  const prefix = opts.prefix ?? "";
  const s = prefix + text;
  const blocked = rangeChecker(blockedRanges(s));
  const at = new Set<number>(); // insert positions (after the preceding character), in s coordinates
  // Not directly behind a URL plus punctuation: Markdown renderers (GFM autolinks) would otherwise pull the
  // punctuation and the signature into the link.
  const afterUrl = (pos: number) => /(?:https?:\/\/|www\.)\S*$/i.test(s.slice(Math.max(0, pos - 300), pos));
  const ok = (pos: number) => pos > prefix.length && /\S/.test(s[pos - 1]) && !blocked(pos - 1, pos) && !afterUrl(pos);
  const addLineEnd = (pos: number) => {
    const p = lineEndPosition(s, pos);
    if (p !== null && ok(p)) at.add(p);
  };

  for (let i = prefix.length; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\n") {
      addLineEnd(i);
    } else if (/\s/.test(ch) && endsWithSentenceEnd(s.slice(Math.max(0, i - 40), i))) {
      if (ok(i)) at.add(i);
    }
  }
  if (opts.atEnd) addLineEnd(s.length);
  if (at.size === 0 && opts.atEnd) {
    // Fallback: behind the last visible, unprotected character outside delimiter lines.
    for (let p = s.length; p > prefix.length; p--) {
      const lineEnd = s.indexOf("\n", p) === -1 ? s.length : s.indexOf("\n", p);
      if (ok(p) && lineEndPosition(s, lineEnd) !== null) { at.add(p); break; }
    }
  }

  let out = "";
  let last = prefix.length;
  for (const pos of [...at].sort((a, b) => a - b)) {
    out += s.slice(last, pos) + (typeof vs === "string" ? vs : vs(s.slice(sentenceStart(s, pos), pos)));
    last = pos;
  }
  return out + s.slice(last);
}

/** Signatures/markers in the text with their position in the text without signatures (`prev`: end of the previous one). */
export function scanMarkers(text: string): { plain: string; markers: { run: string; pos: number; prev: number }[] } {
  const markers: { run: string; pos: number; prev: number }[] = [];
  let removed = 0;
  let prev = 0;
  for (const m of text.matchAll(SIGNATURE_RE)) {
    const pos = m.index! - removed;
    removed += m[0].length;
    markers.push({ run: m[0], pos, prev });
    prev = pos;
  }
  return { plain: stripSignature(text), markers };
}

/**
 * Candidate sentences before `pos`: from the previous sentence/line end, from the previous signature, from
 * the line start, or from one of the last 80 word starts (for sentences preceded by foreign text after copying).
 */
export function sentenceCandidates(plain: string, pos: number, prev: number): string[] {
  const lineStart = plain.lastIndexOf("\n", pos - 1) + 1;
  const starts = new Set([sentenceStart(plain, pos), prev, lineStart]);
  for (let i = pos - 1, words = 0; i > lineStart && words < 80; i--) {
    if (/\s/.test(plain[i - 1]) && /\S/.test(plain[i])) {
      starts.add(i);
      words++;
    }
  }
  return [...starts].map((st) => plain.slice(st, pos));
}

export interface SignatureCheck {
  /** Runs found in the signature format (0xF2). */
  found: number;
  /** Of which with a valid HMAC. */
  valid: number;
  signed: boolean;
  customerId?: number;
  responseId?: string;
  /** Several different valid responses in the text (e.g. pasted together). */
  responses: { customerId: number; responseId: string; count: number }[];
  /** Valid signatures with a content checksum, and of those the ones matching their sentence. */
  contentChecked: number;
  contentMatched: number;
}

/** Verify signatures. `keyFor` returns the key for a customer ID (or undefined). */
export function verifySignature(text: string, keyFor: (customerId: number) => string | undefined): SignatureCheck {
  let found = 0;
  let valid = 0;
  let contentChecked = 0;
  let contentMatched = 0;
  const responses = new Map<string, { customerId: number; responseId: string; count: number }>();
  const { plain, markers } = scanMarkers(text);
  for (const { run, pos, prev } of markers) {
    const bytes = fromRun(run);
    if (bytes.length !== PAYLOAD_LEN || bytes[0] !== VERSION) continue;
    found++;
    const bodyLen = bytes.length - 6;
    const body = Uint8Array.from(bytes.slice(0, bodyLen));
    const customerId = new DataView(body.buffer).getUint32(1);
    const key = keyFor(customerId);
    if (!key) continue;
    if (!mac(key, body).equals(Buffer.from(bytes.slice(bodyLen)))) continue;
    valid++;
    contentChecked++;
    const tag = Buffer.from(body.subarray(11, 14));
    // Chance hit on foreign text: at most ~83 attempts × 2^-24 ≈ 5·10^-6 per signature.
    if (sentenceCandidates(plain, pos, prev).some((c) => contentTag(key, body.subarray(1, 11), c).equals(tag))) contentMatched++;
    const responseId = Buffer.from(body.subarray(5, 11)).toString("hex");
    const id = `${customerId}:${responseId}`;
    const r = responses.get(id) ?? { customerId, responseId, count: 0 };
    r.count++;
    responses.set(id, r);
  }
  const list = [...responses.values()].sort((a, b) => b.count - a.count);
  return {
    found,
    valid,
    signed: valid > 0,
    customerId: list[0]?.customerId,
    responseId: list[0]?.responseId,
    responses: list,
    contentChecked,
    contentMatched,
  };
}
