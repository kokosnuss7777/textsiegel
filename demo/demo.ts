// Feasibility test of signature + Choice-Point-Mark against any OpenAI-compatible chat API.
//
//   export API_KEY="sk-..."
//   export BASE_URL="https://llm.aihosting.mittwald.de/v1"   # default; any OpenAI-compatible endpoint
//   export MODEL="Qwen3.8-27B-NVFP4"
//   node demo/demo.ts
//
// Optional: MARK_KEY (watermark key), CUSTOMER_ID, PARAPHRASE=0 (no rewording requests).
// Without API_KEY the offline mode runs on the sample texts from samples.ts.
// The chatbot persona and questions are German, as the Choice-Point-Mark classes are defined for German text.

import { mkdirSync, writeFileSync } from "node:fs";
import { markResponse, verify, stripSignature, SIGNATURE_RE, type Verification } from "../src/cpmark.ts";
import { SAMPLES } from "./samples.ts";

const API_KEY = process.env.API_KEY;
const MODEL = process.env.MODEL ?? "Qwen3.8-27B-NVFP4";
const BASE_URL = process.env.BASE_URL ?? "https://llm.aihosting.mittwald.de/v1";
const CUSTOMER = { id: Number(process.env.CUSTOMER_ID ?? 1), key: process.env.MARK_KEY ?? "demo-key-please-change" };
const PARAPHRASE = process.env.PARAPHRASE !== "0";
const ALPHA = 1e-4;

const SYSTEM = `Du bist der Website-Assistent der Gärtnerei Lindenhof (fiktiv). Antworte auf Deutsch, freundlich, sachlich, in Markdown.
Fakten:
- Öffnungszeiten: Mo–Fr 8 bis 18 Uhr, Sa 9 bis 14 Uhr, sonn- und feiertags geschlossen.
- Versand: Bestellungen bis 14 Uhr gehen am selben Tag raus, Lieferzeit 2 bis 3 Werktage, Spedition für Großpflanzen bis 7 Werktage.
- Versandkosten: 5,90 € bis 49 € Bestellwert, darüber versandkostenfrei, Spedition pauschal 39 €.
- Abholung vor Ort kostenlos, Ware liegt 5 Tage bereit.
- Rückgabe: 30 Tage, nicht für lebende Pflanzen, Rücksendung kostenlos, Erstattung in 5 bis 7 Werktagen inkl. Versandkosten.
- Rabatt: 10 % für Stammkunden ab 100 € Einkaufswert.
- Pflegeberatung: kostenlos vor Ort, Fotos an pflege@lindenhof-beispiel.de.
- Gutscheine ab 10 €, 3 Jahre gültig.`;

const QUESTIONS: { q: string; long: boolean }[] = [
  { q: "Wie läuft der Versand ab und was kostet er? Bitte ausführlich.", long: true },
  { q: "Kann ich Pflanzen zurückgeben? Erkläre mir den Ablauf genau.", long: true },
  { q: "Wie pflege ich einen Olivenbaum über den Winter? Gib mir eine ausführliche Anleitung.", long: true },
  { q: "Ich bin Stammkunde. Welche Vorteile habe ich und wie funktionieren Gutscheine? Bitte ausführlich.", long: true },
  { q: "Ich möchte für meinen Garten eine Hecke pflanzen. Was muss ich beachten und wie könnt ihr mir helfen? Ausführlich bitte.", long: true },
  { q: "Wann habt ihr geöffnet?", long: false },
  { q: "Kann ich bestellte Ware abholen?", long: false },
  { q: "Was kostet der Versand für einen Bestellwert von 30 Euro?", long: false },
];

// ---------------------------------------------------------------------------

async function chat(messages: { role: string; content: string }[], maxTokens: number) {
  const body: Record<string, unknown> = { model: MODEL, messages, max_tokens: maxTokens, temperature: 0.7, chat_template_kwargs: { enable_thinking: false } };
  const send = () =>
    fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  let res = await send();
  if (res.status === 400) {
    // Some models do not know chat_template_kwargs → retry without.
    delete body.chat_template_kwargs;
    res = await send();
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return { text: String(json.choices?.[0]?.message?.content ?? ""), tokens: Number(json.usage?.completion_tokens ?? NaN) };
}

// ---------- Scenarios ----------

/** One sentence copied out (between the first and second signature, otherwise the whole text). */
function partialCopy(t: string): string {
  const runs = [...t.matchAll(SIGNATURE_RE)];
  if (runs.length < 3) return t;
  return t.slice(runs[0].index! + runs[0][0].length, runs[1].index! + runs[1][0].length).trim();
}

/** A filter removes invisible characters, everything else stays. */
const sanitized = (t: string) => stripSignature(t);

/** Light editing: 15 % of the words removed (deterministic). */
function edited(t: string): string {
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return t.split(/(\s+)/).filter((w) => /\s/.test(w) || rand() > 0.15).join("");
}

/** Retyped: invisible characters gone, typography normalized. */
const retyped = (t: string) =>
  stripSignature(t).replace(/[  ]/g, " ").replace(/[„“”]/g, '"').replace(/ – /g, " - ").replace(/…/g, "...");

const SCENARIOS = ["marked", "partial", "sanitized", "edited", "retyped", "reworded"] as const;
type Scenario = (typeof SCENARIOS)[number];

const cell = (v: Verification | null) => {
  if (!v) return "–";
  const s = v.signature.signed;
  const c = Boolean(v.statistic?.marked);
  return s && c ? "S+C" : s ? "S" : c ? "C" : "no";
};
const fmtP = (v: Verification | null) => {
  const p = v?.statistic?.pAdjusted;
  return p === undefined ? "–" : p < 1e-12 ? "<1e-12" : p.toExponential(1);
};

interface Row {
  id: string;
  tokens: number;
  tokensEstimated: boolean;
  points: number;
  results: Record<Scenario, Verification | null>;
  unmarked: Verification;
}

async function main() {
  const online = Boolean(API_KEY);
  console.log(online ? `Online mode: ${MODEL} @ ${BASE_URL}` : "Offline mode (no API_KEY): sample texts from samples.ts");

  const inputs: { id: string; text: string; tokens: number; estimated: boolean }[] = [];
  if (online) {
    for (const [i, { q, long }] of QUESTIONS.entries()) {
      process.stdout.write(`question ${i + 1}/${QUESTIONS.length} … `);
      const r = await chat([{ role: "system", content: SYSTEM }, { role: "user", content: q }], long ? 700 : 250);
      inputs.push({ id: `question-${i + 1}`, text: r.text, tokens: r.tokens, estimated: false });
      console.log(`${r.tokens} tokens`);
    }
  } else {
    for (const s of SAMPLES) inputs.push({ id: s.id, text: s.text, tokens: Math.round(s.text.length / 3.3), estimated: true });
  }

  const customers = [CUSTOMER];
  const rows: Row[] = [];
  for (const inp of inputs) {
    const signed = markResponse(inp.text, { key: CUSTOMER.key, signature: { customerId: CUSTOMER.id } }).text;
    let para: Verification | null = null;
    if (online && PARAPHRASE) {
      const p = await chat(
        [{ role: "user", content: `Formuliere den folgenden Text mit eigenen Worten um, Inhalt und Fakten bleiben gleich:\n\n${signed}` }],
        900,
      );
      para = verify(p.text, customers, ALPHA);
    }
    const results: Record<Scenario, Verification | null> = {
      marked: verify(signed, customers, ALPHA),
      partial: verify(partialCopy(signed), customers, ALPHA),
      sanitized: verify(sanitized(signed), customers, ALPHA),
      edited: verify(edited(signed), customers, ALPHA),
      retyped: verify(retyped(signed), customers, ALPHA),
      reworded: para,
    };
    rows.push({
      id: inp.id,
      tokens: inp.tokens,
      tokensEstimated: inp.estimated,
      points: results.marked!.statistic?.points ?? 0,
      results,
      unmarked: verify(inp.text, customers, ALPHA),
    });
  }

  // ---------- Output ----------
  const table = (header: string[], lines: string[][]) => {
    const w = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
    const f = (c: string[]) => c.map((x, i) => x.padEnd(w[i])).join("  ");
    return [f(header), w.map((n) => "-".repeat(n)).join("  "), ...lines.map(f)].join("\n");
  };
  const h1 = ["text", "tokens", "points", ...SCENARIOS, "unmarked"];
  const l1 = rows.map((r) => [r.id, `${r.tokens}${r.tokensEstimated ? "~" : ""}`, String(r.points), ...SCENARIOS.map((s) => cell(r.results[s])), cell(r.unmarked)]);
  const h2 = ["text", ...SCENARIOS.map((s) => `p ${s}`)];
  const l2 = rows.map((r) => [r.id, ...SCENARIOS.map((s) => fmtP(r.results[s]))]);

  console.log("\nEvidence per scenario (S = valid signature, C = statistic p < 1e-4)\n");
  console.log(table(h1, l1));
  console.log("\nStatistic (Choice-Point-Mark), corrected p-value\n");
  console.log(table(h2, l2));

  const long = rows.filter((r) => r.tokens > 200);
  const rate = (pred: (v: Verification) => boolean, s: Scenario) => {
    const vs = long.map((r) => r.results[s]).filter((v): v is Verification => v !== null);
    return vs.length ? `${vs.filter(pred).length}/${vs.length}` : "–";
  };
  const summaryRows = SCENARIOS.map((s) => [
    s,
    rate((v) => v.signature.signed, s),
    rate((v) => Boolean(v.statistic?.marked), s),
    rate((v) => v.verdict !== "none", s),
  ]);
  const h3 = ["scenario", "signature", "statistic", "detectable"];
  console.log(`\nResponses over 200 tokens (${long.length}):\n`);
  console.log(table(h3, summaryRows));
  const falsePositives = rows.filter((r) => r.unmarked.verdict !== "none").length;
  console.log(`\nFalse positives on unmarked texts: ${falsePositives}`);

  mkdirSync("report", { recursive: true });
  const slim = (v: Verification | null) =>
    v && {
      verdict: v.verdict,
      signature: { found: v.signature.found, valid: v.signature.valid },
      statistic: v.statistic && {
        points: v.statistic.points, matches: v.statistic.matches, pAdjusted: v.statistic.pAdjusted,
        pCombined: v.statistic.pCombined, byLayer: v.statistic.byLayer,
      },
    };
  // Offline runs go to separate files so they never overwrite an online measurement.
  const base = online ? "report/results" : "report/results-offline";
  writeFileSync(
    `${base}.json`,
    JSON.stringify(
      {
        mode: online ? "online" : "offline", model: online ? MODEL : null, falsePositives,
        rows: rows.map((r) => ({
          id: r.id, tokens: r.tokens, tokensEstimated: r.tokensEstimated, points: r.points,
          unmarked: slim(r.unmarked), ...Object.fromEntries(SCENARIOS.map((s) => [s, slim(r.results[s])])),
        })),
      },
      null,
      2,
    ),
  );
  const mdTable = (h: string[], l: string[][]) => [`| ${h.join(" | ")} |`, `| ${h.map(() => "---").join(" | ")} |`, ...l.map((x) => `| ${x.join(" | ")} |`)].join("\n");
  writeFileSync(
    `${base}.md`,
    [
      `# Signature + Choice-Point-Mark – feasibility test`,
      ``,
      `Mode: ${online ? `online, model ${MODEL}` : "offline"}. S = valid signature, C = statistic p < 1e-4. "~" = estimated tokens.`,
      ``,
      `## Evidence per scenario`,
      ``,
      mdTable(h1, l1),
      ``,
      `## Statistic, corrected p-value`,
      ``,
      mdTable(h2, l2),
      ``,
      `## Responses over 200 tokens`,
      ``,
      mdTable(h3, summaryRows),
      ``,
      `False positives on unmarked texts: ${falsePositives}`,
      ``,
      `## Scenarios`,
      ``,
      `- **marked:** response as delivered by the chatbot`,
      `- **partial:** a single sentence copied out`,
      `- **sanitized:** a filter removes invisible characters, typography stays`,
      `- **edited:** 15 % of the words removed`,
      `- **retyped:** invisible characters gone, typography normalized`,
      `- **reworded:** rewritten by the model in its own words`,
    ].join("\n"),
  );
  console.log(`\nReport: ${base}.md and ${base}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
