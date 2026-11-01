// Choice-Point-Mark: a statistical watermark built from choice points.
//
// Principle: at every match of a choice-point class (see classes.ts), HMAC(key, class + previous word)
// selects a "green" variant. The marker writes it, the detector counts hits. Human text hits by chance
// (≈ 1/k per choice point), marked text always.
//
// Guarantees (covered by tests):
//   - markText(markText(t)) === markText(t)                    (idempotent)
//   - streamed marking === marking of the whole text          (sentence by sentence)
//   - code, URLs, links, HTML, email addresses and quoted content stay untouched

import { createHmac } from "node:crypto";
import { CLASSES, QUOTE_CLASS_ID, QUOTE_STYLES, type ChoiceClass, type Layer } from "./classes.ts";
import { blockedRanges, endsWithSentenceEnd, findQuotePairs, protectedRanges, rangeChecker } from "./text.ts";
import { randomBytes } from "node:crypto";
import { embedSignature, encodeSignature, stripSignature, verifySignature, type SignatureCheck } from "./signature.ts";
import type { Provenance } from "./provenance.ts";

export { protectedRanges, findQuotePairs } from "./text.ts";
export { stripSignature, verifySignature, SIGNATURE_RE } from "./signature.ts";

export interface Options {
  /** Secret key. */
  key: string;
  /** Active layers. Default: both. */
  layers?: Layer[];
  /** Disable individual classes (e.g. for customers with a strict brand voice). */
  disabledClasses?: string[];
}

export interface Point {
  classId: string;
  layer: Layer;
  /** Position of the choice point (in the respective phase). */
  index: number;
  text: string;
  context: string;
  sentenceStart: boolean;
  observed: number;
  green: number;
  allowed: number;
  match: boolean;
}

export interface Change {
  classId: string;
  from: string;
  to: string;
}

export interface Detection {
  /** Unique choice points (context duplicates count once). */
  points: number;
  matches: number;
  /** Expected hits for unmarked text. */
  expected: number;
  /**
   * Decision value: smallest p-value of {combined, lexical, typography}, Bonferroni-corrected (×3).
   * A removed layer (e.g. typography after retyping) therefore does not dilute the other one.
   */
  pValue: number;
  /** p-value over all choice points (uncorrected). */
  pCombined: number;
  marked: boolean;
  byLayer: Record<Layer, { points: number; matches: number; pValue: number }>;
  details: Point[];
}

// ---------------------------------------------------------------------------
// Helpers

function activeClasses(o: Options): ChoiceClass[] {
  const layers = o.layers ?? ["lexical", "typography"];
  const off = new Set(o.disabledClasses ?? []);
  return CLASSES.filter((c) => layers.includes(c.layer) && !off.has(c.id));
}

function quotesActive(o: Options): boolean {
  return (o.layers ?? ["lexical", "typography"]).includes("typography") && !(o.disabledClasses ?? []).includes(QUOTE_CLASS_ID);
}

const regexCache = new Map<string, RegExp>();
function combinedRegex(classes: ChoiceClass[]): RegExp {
  const cacheKey = classes.map((c) => c.id).join(",");
  let re = regexCache.get(cacheKey);
  if (!re) {
    re = new RegExp(classes.map((c, i) => `(?<g${i}>${c.source})`).join("|"), "giu");
    regexCache.set(cacheKey, re);
  }
  re.lastIndex = 0;
  return re;
}

const SS_TAIL =
  "(?:[.!?…][\"“”»«'’)\\]]*\\s+|\\n)\\s*(?:[-*+]\\s+|\\d+[.)]\\s+|#{1,6}\\s+|>\\s*)?(?:\\*\\*|__|\\*|_)?[\"„“»«'‚(\\[]*$";
const SS_ANCHORED = new RegExp(`(?:^\\s*(?:[-*+]\\s+|\\d+[.)]\\s+|#{1,6}\\s+|>\\s*)?(?:\\*\\*|__|\\*|_)?[\"„“»«'‚(\\[]*$)|${SS_TAIL}`, "u");
const SS_FREE = new RegExp(SS_TAIL, "u");

function isSentenceStart(prefix: string): boolean {
  return prefix.length <= 80 ? SS_ANCHORED.test(prefix) : SS_FREE.test(prefix.slice(-80));
}

/** Last word or number before the choice point (numbers incl. separators: „18:00“, „3.500“). */
function prevToken(prefix: string): string {
  const m = /(\p{N}+(?:[:.,]\p{N}+)*|\p{L}[\p{L}\p{N}]*)[^\p{L}\p{N}]*$/u.exec(prefix.slice(-200));
  return m ? m[1].toLowerCase() : "^";
}

/** For classes mixing abbreviation and long form: only count if no sentence end can follow. */
function followOk(after: string): boolean {
  return /^[ \t\u00A0\u202F]+[\p{Ll}\p{N}]/u.test(after) || /^[,;:)]/.test(after);
}

function greenIndex(key: string, classId: string, ctx: string, ss: boolean, allowed: number[]): number {
  const h = createHmac("sha256", key).update(`${classId}\u0000${ctx}\u0000${ss ? 1 : 0}`).digest();
  return allowed[h.readUInt32BE(0) % allowed.length];
}

// ---------------------------------------------------------------------------
// Core: processes `seg` with the already finished `prefix` as left context.

function processSegment(prefix: string, seg: string, o: Options, mode: "mark" | "scan") {
  const classes = activeClasses(o);
  const points: Point[] = [];
  const changes: Change[] = [];

  // Phase 1: word and character choice points, sequentially, context always taken from the output.
  // `s` is the whole text so far; a change replaces the match in it and only then are the blocked ranges
  // recomputed, so scanning stays linear (verification scans untrusted text).
  let s = prefix + seg;
  if (classes.length > 0) {
    const re = combinedRegex(classes);
    let blocked = rangeChecker(blockedRanges(s));
    re.lastIndex = prefix.length;
    for (let m = re.exec(s); m; m = re.exec(s)) {
      const start = m.index;
      const end = start + m[0].length;
      if (blocked(start, end)) continue;
      const gi = Object.entries(m.groups!).findIndex(([, v]) => v !== undefined);
      const cls = classes[Number(Object.keys(m.groups!)[gi].slice(1))];
      if (cls.dotMix && !followOk(s.slice(end, end + 4))) continue;
      const before = s.slice(0, start);
      const ss = isSentenceStart(before);
      if (cls.onlySentenceStart && !ss) continue;
      const allowed = [...Array(cls.variantCount).keys()].filter((v) => !(ss && cls.notSentenceStart?.includes(v)));
      if (allowed.length < 2) continue;
      // Consistent formatting classes: one fixed context → the same variant throughout the text.
      const ctx = cls.consistent ? "*" : prevToken(before);
      const ssKey = cls.consistent ? false : ss;
      const observed = cls.classify(m[0]);
      const green = greenIndex(o.key, cls.id, ctx, ssKey, allowed);
      points.push({
        classId: cls.id, layer: cls.layer, index: start, text: m[0], context: ctx,
        sentenceStart: ssKey, observed, green, allowed: allowed.length, match: observed === green,
      });
      if (mode === "mark" && observed !== green) {
        const to = cls.render(m[0], green);
        changes.push({ classId: cls.id, from: m[0], to });
        s = before + to + s.slice(end);
        blocked = rangeChecker(blockedRanges(s));
        re.lastIndex = start + to.length;
      }
    }
  }

  // Phase 2: quotation mark pairs (they change no words, hence separate).
  let t = s;
  if (quotesActive(o)) {
    const { pairs } = findQuotePairs(t, protectedRanges(t));
    for (const p of pairs) {
      if (p.open < prefix.length) continue;
      const ctx = "*"; // consistent throughout the text
      const allowed = [0, 1];
      const green = greenIndex(o.key, QUOTE_CLASS_ID, ctx, false, allowed);
      points.push({
        classId: QUOTE_CLASS_ID, layer: "typography", index: p.open, text: t[p.open] + "…" + t[p.close],
        context: ctx, sentenceStart: false, observed: p.style, green, allowed: 2, match: p.style === green,
      });
      if (mode === "mark" && p.style !== green) {
        const [oq, cq] = QUOTE_STYLES[green];
        changes.push({ classId: QUOTE_CLASS_ID, from: t[p.open] + "…" + t[p.close], to: oq + "…" + cq });
        t = t.slice(0, p.open) + oq + t.slice(p.open + 1, p.close) + cq + t.slice(p.close + 1);
      }
    }
  }

  return { out: t.slice(prefix.length), points, changes };
}

// ---------------------------------------------------------------------------
// Public API

export function markText(text: string, o: Options): { text: string; changes: Change[] } {
  const r = processSegment("", text, o, "mark");
  return { text: r.out, changes: r.changes };
}

/** Exact p-value (Poisson binomial, upper tail). */
function upperTail(ps: number[], m: number): number {
  let dp = [1];
  for (const p of ps) {
    const next = new Array(dp.length + 1).fill(0);
    for (let k = 0; k < dp.length; k++) {
      next[k] += dp[k] * (1 - p);
      next[k + 1] += dp[k] * p;
    }
    dp = next;
  }
  let sum = 0;
  for (let k = m; k < dp.length; k++) sum += dp[k];
  return Math.min(1, sum);
}

export function detect(text: string, o: Options & { alpha?: number }): Detection {
  const { points } = processSegment("", stripSignature(text), o, "scan");
  const seen = new Set<string>();
  const unique: Point[] = [];
  for (const p of points) {
    const k = `${p.classId}|${p.context}|${p.sentenceStart ? 1 : 0}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(p);
  }
  const tail = (pts: Point[]) => upperTail(pts.map((p) => 1 / p.allowed), pts.filter((p) => p.match).length);
  const layer = (l: Layer) => {
    const pts = unique.filter((p) => p.layer === l);
    return { points: pts.length, matches: pts.filter((p) => p.match).length, pValue: tail(pts) };
  };
  const byLayer = { lexical: layer("lexical"), typography: layer("typography") };
  const pCombined = tail(unique);
  const pValue = Math.min(1, 3 * Math.min(pCombined, byLayer.lexical.pValue, byLayer.typography.pValue));
  return {
    points: unique.length,
    matches: unique.filter((p) => p.match).length,
    expected: unique.reduce((a, p) => a + 1 / p.allowed, 0),
    pValue,
    pCombined,
    marked: pValue < (o.alpha ?? 1e-4),
    byLayer,
    details: unique,
  };
}

// ---------------------------------------------------------------------------
// Streaming: mark sentence by sentence without changing the result compared to markText.

function balanced(t: string): boolean {
  if ((t.match(/```/g) ?? []).length % 2 !== 0) return false;
  const noFences = t.replace(/```[\s\S]*?```/g, "");
  if ((noFences.match(/`/g) ?? []).length % 2 !== 0) return false;
  const count = (c: string) => t.split(c).length - 1;
  if (count("[") !== count("]") || count("(") !== count(")") || count("<") !== count(">")) return false;
  return !findQuotePairs(t, protectedRanges(t)).unmatched;
}

/** Safe cut position in `pending` (0 = none yet): before whitespace after a sentence end, or before a line break. */
function safeCut(emitted: string, pending: string): number {
  for (let i = pending.length - 1; i > 0; i--) {
    const ch = pending[i];
    let candidate = false;
    if (ch === "\n") {
      candidate = true;
    } else if (/\s/.test(ch)) {
      candidate = endsWithSentenceEnd(pending.slice(Math.max(0, i - 40), i));
    }
    if (candidate && balanced(emitted + pending.slice(0, i))) return i;
  }
  return 0;
}

export interface ResponseOptions extends Options {
  /** Enable the signature layer (customer ID + optional fixed response ID). */
  signature?: { customerId: number; responseId?: Uint8Array };
  /**
   * Publicly verifiable provenance (marker 0xF3, Ed25519) instead of the HMAC signature. One instance per
   * response; call `provenance.finish()` at the end and store the record in the directory.
   */
  provenance?: Provenance;
}

/** Mark a complete response: Choice-Point-Mark + optional signature or provenance marker. */
export function markResponse(text: string, o: ResponseOptions): { text: string; changes: Change[]; responseId?: string } {
  const m = markText(text, o);
  if (o.provenance) return { ...m, text: embedSignature(m.text, o.provenance.sign, { atEnd: true }), responseId: o.provenance.responseId };
  if (!o.signature) return m;
  const { sign, responseId } = signer({ ...o, signature: o.signature });
  return { text: embedSignature(m.text, sign, { atEnd: true }), changes: m.changes, responseId };
}

/** One signature per sentence (bound to the sentence content), one response ID for the whole response. */
function signer(o: ResponseOptions & { signature: NonNullable<ResponseOptions["signature"]> }) {
  const rid = o.signature.responseId ?? randomBytes(6);
  const sign = (sentence: string) => encodeSignature({ key: o.key, customerId: o.signature.customerId, responseId: rid }, sentence).vs;
  return { sign, responseId: Buffer.from(rid).toString("hex") };
}

export class StreamMarker {
  /** Text emitted so far, without signatures (context for marking). */
  private emitted = "";
  private pending = "";
  private readonly o: ResponseOptions;
  private readonly sign: ((sentence: string) => string) | null;
  /** Response ID (hex), if a signature or provenance is active. */
  readonly responseId?: string;
  constructor(o: ResponseOptions) {
    this.o = o;
    if (o.provenance) {
      this.sign = o.provenance.sign;
      this.responseId = o.provenance.responseId;
    } else if (o.signature) {
      const s = signer({ ...o, signature: o.signature });
      this.sign = s.sign;
      this.responseId = s.responseId;
    } else {
      this.sign = null;
    }
  }
  private emit(seg: string): string {
    const { out } = processSegment(this.emitted, seg, this.o, "mark");
    const signed = this.sign ? embedSignature(out, this.sign, { prefix: this.emitted, atEnd: true }) : out;
    this.emitted += out;
    return signed;
  }
  /** Add a chunk; returns the finished, marked part (may be empty). */
  push(chunk: string): string {
    this.pending += chunk;
    const cut = safeCut(this.emitted, this.pending);
    if (cut === 0) return "";
    const seg = this.pending.slice(0, cut);
    this.pending = this.pending.slice(cut);
    return this.emit(seg);
  }
  /** Stream finished: mark and return the rest. */
  flush(): string {
    const seg = this.pending;
    this.pending = "";
    return seg ? this.emit(seg) : "";
  }
}

// ---------------------------------------------------------------------------
// Verification

export interface Customer {
  id: number;
  key: string;
}

export interface Verification {
  /** Evidence from the signature (deterministic). */
  signature: SignatureCheck;
  /** Statistical evidence (Choice-Point-Mark) for the most likely customer. */
  statistic: (Detection & { customerId: number; pAdjusted: number }) | null;
  /**
   * Overall verdict. "signed-altered": the signature is genuine (key matches), but none matches the sentence
   * before it – the text was edited or the signature was attached to foreign text.
   */
  verdict: Verdict;
}

export type Verdict = "signed" | "signed-altered" | "statistical" | "none";

/**
 * Verify a text. If the signature is valid, the statistic is only checked with that customer's key.
 * Otherwise all customers are checked and the p-value is corrected for the number of customers.
 */
export function verify(text: string, customers: Customer[], alpha = 1e-4): Verification {
  const byId = new Map(customers.map((c) => [c.id, c.key]));
  const signature = verifySignature(text, (id) => byId.get(id));
  const candidates = signature.signed ? customers.filter((c) => c.id === signature.customerId) : customers;
  let best: Verification["statistic"] = null;
  for (const c of candidates) {
    const d = detect(text, { key: c.key, alpha });
    const pAdjusted = Math.min(1, d.pValue * candidates.length);
    if (!best || pAdjusted < best.pAdjusted) best = { ...d, customerId: c.id, pAdjusted, marked: pAdjusted < alpha };
  }
  const verdict = signature.signed
    ? signature.contentMatched > 0 ? "signed" : "signed-altered"
    : best?.marked ? "statistical" : "none";
  return { signature, statistic: best, verdict };
}
