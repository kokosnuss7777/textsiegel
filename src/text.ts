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
  add(/\[[^\]\n]*\]\([^)\n]*\)/g); // Markdown links incl. link text
  add(/(?:https?:\/\/|www\.)[^\s<>"„“”»«]*[^\s<>"„“”»«.,;:!?)]/gi); // URLs
  add(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+\.[\p{L}\p{N}.-]*\p{L}/gu); // email
  add(/<[^>\n]+>/g); // HTML tags
  return r;
}

export function overlaps(start: number, end: number, ranges: Range[]): boolean {
  for (const [a, b] of ranges) if (start < b && end > a) return true;
  return false;
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
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const closers = OPENERS[ch];
    if (!closers || overlaps(i, i + 1, prot)) continue;
    if (ch === '"' || ch === "“") {
      const prev = i > 0 ? s[i - 1] : " ";
      if (!/[\s(\[{>]/.test(prev)) continue; // e.g. inch mark 17"
    }
    if (i + 1 >= s.length || /\s/.test(s[i + 1])) continue;
    let j = -1;
    for (let k = i + 1; k < s.length && k < i + 400; k++) {
      if (s[k] === "\n" && s[k + 1] === "\n") break;
      if (closers.includes(s[k]) && !overlaps(k, k + 1, prot)) {
        j = k;
        break;
      }
    }
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
