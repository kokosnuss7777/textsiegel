// Choice-point classes for Choice-Point-Mark (German text).
//
// Rule for every class: all variants must be grammatically and semantically
// interchangeable. When in doubt, leave a class out – precision beats quantity.

export type Layer = "lexical" | "typography";

export interface ChoiceClass {
  id: string;
  layer: Layer;
  /** Regex source without named groups. Must match exactly one choice point. */
  source: string;
  /** Number of variants the marker may output. */
  variantCount: number;
  /** Which output variant is this? -1 = recognized, but not an allowed output form. */
  classify(match: string): number;
  /** Rewrite the match as variant `v`. */
  render(match: string, v: number): string;
  /** Variants not used at the start of a sentence (e.g. „z. B.“). */
  notSentenceStart?: number[];
  /**
   * The class mixes abbreviations with a dot and long forms without one.
   * A match then only counts if it is clearly not followed by a sentence end.
   */
  dotMix?: boolean;
  /** Only at the start of a sentence (word order would change otherwise). */
  onlySentenceStart?: boolean;
  /**
   * Visible formatting choice (quotes, dash, time of day): always the same variant within a text
   * so nothing looks inconsistent. Therefore counts only once per text.
   */
  consistent?: boolean;
}

const B = "(?<![\\p{L}\\p{N}])"; // word boundary, left (Unicode)
const E = "(?![\\p{L}\\p{N}])"; // word boundary, right (Unicode)

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SP = "[ \\u00A0\\u202F]"; // regular, no-break, narrow no-break space

function capitalizeLike(original: string, replacement: string): string {
  const first = original[0];
  if (first && first !== first.toLowerCase() && first === first.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Class of fixed word variants. `alt` = further spellings recognized as variant i. */
function lexical(
  id: string,
  variants: string[],
  opts: {
    alt?: Record<string, number>;
    recognizeOnly?: string[];
    notSentenceStart?: number[];
    /** Required lookahead, e.g. a following number. */
    before?: string;
    onlySentenceStart?: boolean;
    consistent?: boolean;
  } = {},
): ChoiceClass {
  const surfaces = new Map<string, number>();
  variants.forEach((v, i) => surfaces.set(v.toLowerCase(), i));
  for (const [s, i] of Object.entries(opts.alt ?? {})) surfaces.set(s.toLowerCase(), i);
  for (const s of opts.recognizeOnly ?? []) surfaces.set(s.toLowerCase(), -1);
  const ordered = [...surfaces.keys()].sort((a, b) => b.length - a.length);
  const dotted = variants.map((v) => v.endsWith("."));
  const tail = opts.before ? `(?=${opts.before})` : E;
  return {
    id,
    layer: "lexical",
    source: `${B}(?:${ordered.map(esc).join("|")})${tail}`,
    variantCount: variants.length,
    classify: (m) => surfaces.get(m.toLowerCase()) ?? -1,
    render: (m, v) => capitalizeLike(m, variants[v]),
    notSentenceStart: opts.notSentenceStart,
    // With a required lookahead (e.g. a number) a sentence end is impossible.
    dotMix: !opts.before && dotted.some(Boolean) && !dotted.every(Boolean),
    onlySentenceStart: opts.onlySentenceStart,
    consistent: opts.consistent,
  };
}

/** Inflected adjective: swap the stem, keep the ending. */
function inflected(id: string, stems: string[]): ChoiceClass {
  return {
    id,
    layer: "lexical",
    source: `${B}(?:${stems.map(esc).join("|")})(?:e|en|er|es|em)?${E}`,
    variantCount: stems.length,
    classify: (m) => stems.findIndex((s) => m.toLowerCase().startsWith(s)),
    render: (m, v) => {
      const cur = stems.findIndex((s) => m.toLowerCase().startsWith(s));
      return capitalizeLike(m, stems[v] + m.slice(stems[cur].length));
    },
  };
}

const NUM_AHEAD = `${SP}\\d`; // followed by a number

const NBSP = String.fromCharCode(0x00a0); // no-break space
const NNBSP = String.fromCharCode(0x202f); // narrow no-break space

const PCT = [" %", NBSP + "%", NNBSP + "%"];
const EUR = [" €", NBSP + "€", NNBSP + "€"];
const NUMSP = [" ", NBSP];

export const CLASSES: ChoiceClass[] = [
  // ---------- Typography: invisible, survives copy-paste (depending on target), not retyping ----------
  {
    id: "percent",
    layer: "typography",
    source: `(?<=\\d)${SP}?%`,
    variantCount: 3,
    classify: (m) => PCT.indexOf(m), // "%" without a space → -1
    render: (_m, v) => PCT[v],
  },
  {
    id: "currency",
    layer: "typography",
    source: `(?<=\\d)${SP}?€`,
    variantCount: 3,
    classify: (m) => EUR.indexOf(m),
    render: (_m, v) => EUR[v],
  },
  {
    // Space between a number and the following word („5 Werktage“): regular or no-break.
    id: "number_space",
    layer: "typography",
    source: `(?<=\\d)[ \\u00A0](?=\\p{L})`,
    variantCount: 2,
    classify: (m) => NUMSP.indexOf(m),
    render: (_m, v) => NUMSP[v],
  },
  {
    id: "dash",
    layer: "typography",
    source: `(?<=\\S) [–—-] (?=\\S)`,
    variantCount: 2,
    classify: (m) => [" – ", " - "].indexOf(m),
    render: (_m, v) => [" – ", " - "][v],
    consistent: true,
  },
  {
    id: "ellipsis",
    layer: "typography",
    source: `(?<!\\.)(?:…|\\.\\.\\.(?!\\.))`,
    variantCount: 2,
    classify: (m) => ["…", "..."].indexOf(m),
    render: (_m, v) => ["…", "..."][v],
    consistent: true,
  },

  // ---------- Lexical: also survives retyping and light editing ----------
  {
    // Full hour: „14 Uhr“ ↔ „14:00 Uhr“
    id: "time_of_day",
    layer: "lexical",
    source: `(?<![\\d:.,])\\d{1,2}(?:[:.]00)?(?=${SP}Uhr${E})`,
    variantCount: 2,
    classify: (m) => (m.endsWith(":00") ? 1 : m.endsWith(".00") ? -1 : 0),
    render: (m, v) => m.replace(/[:.]00$/, "") + (v === 1 ? ":00" : ""),
    consistent: true,
  },
  lexical("furthermore", ["außerdem", "zudem"]),
  lexical("for_example", ["z. B.", "zum Beispiel", "beispielsweise"], {
    alt: { "z.B.": 0, ["z." + NBSP + "B."]: 0, ["z." + NNBSP + "B."]: 0 },
    recognizeOnly: ["bspw."],
    notSentenceStart: [0],
  }),
  lexical("respectively", ["bzw.", "beziehungsweise"]),
  lexical("if_applicable", ["ggf.", "gegebenenfalls"], { notSentenceStart: [0] }),
  // Approximate amounts – only before a number („ca. 5 Tage“), where all forms are equivalent.
  lexical("approximately", ["ca.", "circa", "etwa", "ungefähr", "rund"], { before: NUM_AHEAD, notSentenceStart: [0] }),
  lexical("at_most", ["max.", "maximal", "höchstens"], { before: NUM_AHEAD, notSentenceStart: [0] }),
  lexical("at_least", ["mind.", "mindestens"], { before: NUM_AHEAD, notSentenceStart: [0] }),
  lexical("etc", ["usw.", "etc."], { consistent: true }),
  lexical("including", ["inkl.", "inklusive"], { notSentenceStart: [0] }),
  lexical("possibly", ["evtl.", "eventuell"], { notSentenceStart: [0] }),
  lexical("therefore", ["deshalb", "deswegen"]),
  lexical("currently", ["derzeit", "momentan", "zurzeit"]),
  lexical("gladly", ["gerne", "gern"]),
  lexical("nevertheless", ["trotzdem", "dennoch"]),
  lexical("again", ["noch einmal", "nochmals"]),
  lexical("usually", ["in der Regel", "normalerweise", "üblicherweise"]),
  lexical("afterwards", ["anschließend", "im Anschluss"]),
  lexical("please_note", ["Bitte beachten Sie", "Beachten Sie bitte"], { onlySentenceStart: true }),
  inflected("free_of_charge", ["kostenlos", "kostenfrei"]),
  lexical("so_that", ["sodass", "so dass"]),
  lexical("with_help_of", ["mithilfe", "mit Hilfe"]),
  lexical("due_to", ["aufgrund", "auf Grund"]),
];

/** Quotation marks are handled in pairs (own logic in cpmark.ts). */
export const QUOTE_CLASS_ID = "quotes";
export const QUOTE_STYLES: [string, string][] = [
  ["„", "“"],
  ['"', '"'],
];
