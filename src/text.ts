// Shared text helpers: protected ranges, quotation mark pairs, sentence ends.

import { QUOTE_STYLES } from "./classes.ts";

export type Range = [number, number];

/** Ranges that are never changed. */
export function protectedRanges(s: string): Range[] {
  const r: Range[] = [];
  const add = (re: RegExp) => {
    for (const m of s.matchAll(re)) r.push([m.index!, m.index! + m[0].length]);
  };
  add(/```[\s\S]*?(?:```|$)/g); // code blocks (also unclosed)
  add(/`[^`\n]+`/g); // inline code
  r.push(...markdownLinks(s)); // Markdown links incl. link text
  add(/(?:https?:\/\/|www\.)[^\s<>"„“”»«]*[^\s<>"„“”»«.,;:!?)]/gi); // URLs
  r.push(...emailAddresses(s));
  r.push(...htmlTags(s));
  return r;
}

// The three scanners below find exactly what a regex search would find, but in linear time: a regex retries
// every opening character up to the same stop character, which is quadratic on input like "[[[[…" or "aaaa…".

/** First index ≥ from whose character is in `stops`, or s.length. */
function nextOf(s: string, from: number, stops: string): number {
  let i = from;
  while (i < s.length && !stops.includes(s[i])) i++;
  return i;
}

/** Same matches as /\[[^\]\n]*\]\([^)\n]*\)/g. */
function markdownLinks(s: string): Range[] {
  const out: Range[] = [];
  let close = -1; // cached first ")" or newline at or after some position, reused while still ahead
  for (let i = s.indexOf("["); i !== -1; ) {
    // Every "[" before q stops at the same q, so a failure here fails for all of them.
    const q = nextOf(s, i + 1, "]\n");
    if (s[q] !== "]" || s[q + 1] !== "(") {
      i = s.indexOf("[", q);
      continue;
    }
    if (close < q + 2) close = nextOf(s, q + 2, ")\n");
    if (s[close] === ")") {
      out.push([i, close + 1]);
      i = s.indexOf("[", close + 1);
    } else {
      i = s.indexOf("[", q + 1);
    }
  }
  return out;
}

/** Same matches as /<[^>\n]+>/g. */
function htmlTags(s: string): Range[] {
  const out: Range[] = [];
  for (let i = s.indexOf("<"); i !== -1; ) {
    const q = nextOf(s, i + 1, ">\n");
    if (s[q] === ">" && q > i + 1) {
      out.push([i, q + 1]);
      i = s.indexOf("<", q + 1);
    } else {
      // "<>" fails only for this "<"; a newline or the end fails for every "<" before it.
      i = s.indexOf("<", s[q] === ">" ? q + 1 : q);
    }
  }
  return out;
}

const LOCAL_CHAR = /^[\p{L}\p{N}._%+-]$/u;
const EMAIL_DOMAIN = /[\p{L}\p{N}-]+\.[\p{L}\p{N}.-]*\p{L}/uy;

/** Same matches as /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+\.[\p{L}\p{N}.-]*\p{L}/gu, anchored on "@". */
function emailAddresses(s: string): Range[] {
  const out: Range[] = [];
  let end = 0;
  for (let at = s.indexOf("@"); at !== -1; at = s.indexOf("@", at + 1)) {
    if (at < end) continue;
    // The local part reaches back to the previous match or the first non-local character ("@" is one).
    let start = at;
    while (start > end) {
      const c = s.charCodeAt(start - 1);
      const pair = c >= 0xdc00 && c <= 0xdfff && start - 2 >= end && /[\uD800-\uDBFF]/.test(s[start - 2]);
      const ch = pair ? s.slice(start - 2, start) : s[start - 1];
      if (!LOCAL_CHAR.test(ch)) break;
      start -= ch.length;
    }
    if (start === at) continue;
    EMAIL_DOMAIN.lastIndex = at + 1;
    const m = EMAIL_DOMAIN.exec(s);
    if (!m) continue;
    end = at + 1 + m[0].length;
    out.push([start, end]);
  }
  return out;
}

/** Overlap test against fixed ranges in O(log n) per call: sorted, merged ranges and binary search. */
export function rangeChecker(ranges: Range[]): (start: number, end: number) => boolean {
  const merged: Range[] = [];
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    // Touching ranges stay apart, so an empty query at their boundary overlaps neither.
    if (last && a < last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return (start, end) => {
    // The last range starting before `end` has the largest end of all of them (merged ranges do not overlap).
    let lo = 0;
    let hi = merged.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (merged[mid][0] < end) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && merged[lo - 1][1] > start;
  };
}

export interface QuotePair {
  open: number;
  close: number;
  style: number; // index in QUOTE_STYLES or -1
}

const OPENERS: Record<string, string[]> = { "„": ["“", "”", '"'], "»": ["«"], "“": ["”"], '"': ['"'] };

/** Find quotation mark pairs (left to right, same logic for all styles). */
export function findQuotePairs(s: string, prot: Range[]): { pairs: QuotePair[]; unmatched: boolean } {
  const pairs: QuotePair[] = [];
  let unmatched = false;
  const isProt = rangeChecker(prot);
  // Next unprotected closer and next paragraph break, precomputed once instead of scanned from every opener.
  const nextCloser = new Map<string, Int32Array>();
  let nextBreak: Int32Array | undefined;
  const table = (hit: (k: number) => boolean) => {
    const t = new Int32Array(s.length + 1).fill(s.length);
    for (let k = s.length - 1; k >= 0; k--) t[k] = hit(k) ? k : t[k + 1];
    return t;
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const closers = OPENERS[ch];
    if (!closers || isProt(i, i + 1)) continue;
    if (ch === '"' || ch === "“") {
      const prev = i > 0 ? s[i - 1] : " ";
      if (!/[\s(\[{>]/.test(prev)) continue; // e.g. inch mark 17"
    }
    if (i + 1 >= s.length || /\s/.test(s[i + 1])) continue;
    nextBreak ??= table((k) => s[k] === "\n" && s[k + 1] === "\n");
    let closer = nextCloser.get(ch);
    if (!closer) {
      closer = table((k) => closers.includes(s[k]) && !isProt(k, k + 1));
      nextCloser.set(ch, closer);
    }
    // The closer must come within 400 characters and before the next paragraph break.
    const j = closer[i + 1] < Math.min(s.length, i + 400, nextBreak[i + 1]) ? closer[i + 1] : -1;
    if (j === -1) {
      unmatched = true;
      continue;
    }
    const style = QUOTE_STYLES.findIndex(([o, c]) => o === ch && c === s[j]);
    pairs.push({ open: i, close: j, style });
    i = j;
  }
  return { pairs, unmatched };
}

/** Protected ranges incl. content in quotation marks (literal quotes). */
export function blockedRanges(s: string): Range[] {
  const prot = protectedRanges(s);
  return prot.concat(findQuotePairs(s, prot).pairs.map((p): Range => [p.open, p.close + 1]));
}

const ABBREV = new Set(["bzw", "usw", "etc", "inkl", "evtl", "ggf", "ggfs", "max", "min", "nr", "str", "tel", "bspw", "vgl", "ca", "zzgl", "mind", "sog", "abs", "ff"]);

/** Does `head` end with a real sentence end (not with „z.“, „ca.“, „1.“ etc.)? */
export function endsWithSentenceEnd(head: string): boolean {
  const h = head.replace(/["“”»«'’)\]]+$/, "");
  if (!/[.!?…]$/.test(h)) return false;
  if (!h.endsWith(".")) return true;
  const tok = /([\p{L}\p{N}]*)\.$/u.exec(h)?.[1] ?? "";
  if (/\p{N}$/u.test(tok)) return false;
  if (tok.length > 0 && tok.length <= 2) return false;
  return !ABBREV.has(tok.toLowerCase());
}
