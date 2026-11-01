// textsiegel server: verification service (API), public check page, about page and – optionally – the test page
// that renders marked responses like a chat widget (streamed, sentence by sentence, Markdown) and verifies text
// copied back from other programs.
//
//   node server/server.ts        → http://localhost:8787
//
// Configuration (environment):
//   PORT, HOST                         listen address (HOST=0.0.0.0 in Docker or for phones on the same network)
//   MARK_KEY, CUSTOMER_ID              key for Choice-Point-Mark and the HMAC signature (0xF2)
//   TEXTSIEGEL_ED25519_KEY             private Ed25519 key (PEM/PKCS#8) for provenance (0xF3) and reports,
//   TEXTSIEGEL_ED25519_KEY_FILE        or the path to the PEM file. Without a key an ephemeral one is created –
//                                      for tests only, records are no longer verifiable after a restart.
//   TEXTSIEGEL_KEY_ID                  key ID (default 1)
//   RECORDS_DIR                        directory as files (default: in memory)
//   SERVICE_URL                        public base URL (identifier in reports, links)
//   PROVIDER_NAME, CONTACT             shown on the check and about pages
//   EXPERT_TOKENS                      comma-separated tokens ("Authorization: Bearer …"): statistic, no rate limit
//   RATE_LIMIT                         checks per hour and IP (default 60)
//   TEST_PAGE=0                        disables the test page (/, /api/…) – for public operation
//
// Endpoints:
//   GET  /check                              public check page
//   GET  /about                              marker format and usage (signpost for third parties, Code 3.4)
//   GET  /.well-known/textsiegel.json        signpost, machine-readable
//   GET  /.well-known/textsiegel-keys.json   public keys
//   GET  /v1/records/{responseId}            signed record (no text)
//   POST /v1/verify { text }                 provenance per sentence, internal verification, signed report –
//                                            the text is not stored. Statistic only with an expert token.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, generateKeyPairSync } from "node:crypto";
import { StreamMarker, verify, SIGNATURE_RE } from "../src/cpmark.ts";
import { fromRun } from "../src/signature.ts";
import { createProvenance, verifyPublic } from "../src/provenance.ts";
import { createRateLimiter, createVerificationService, fileDirectory, memoryDirectory } from "../src/service.ts";
import { SAMPLES } from "../demo/samples.ts";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const CUSTOMER = { id: Number(process.env.CUSTOMER_ID ?? 101), key: process.env.MARK_KEY ?? "test-page-key" };
const CUSTOMERS = [CUSTOMER];
const PSEUDONYM = "test-page"; // pseudonymous customer identifier in public records
const PROVIDER = { name: process.env.PROVIDER_NAME ?? "textsiegel demo", contact: process.env.CONTACT ?? "" };

const KEY_ID = Number(process.env.TEXTSIEGEL_KEY_ID ?? 1);
const KEY_PEM = process.env.TEXTSIEGEL_ED25519_KEY ?? (process.env.TEXTSIEGEL_ED25519_KEY_FILE ? readFileSync(process.env.TEXTSIEGEL_ED25519_KEY_FILE, "utf8") : undefined);
const TEST_PAGE = process.env.TEST_PAGE !== "0";
const privateKey = KEY_PEM
  ? createPrivateKey(KEY_PEM)
  : (console.warn("No TEXTSIEGEL_ED25519_KEY set: ephemeral key, for tests only."), generateKeyPairSync("ed25519").privateKey);
const KEYS = [{ keyId: KEY_ID, publicKey: createPublicKey(privateKey), validFrom: new Date().toISOString() }];
const directory = process.env.RECORDS_DIR ? fileDirectory(process.env.RECORDS_DIR) : memoryDirectory();
const BASE_URL = process.env.SERVICE_URL ?? `http://localhost:${PORT}`;
const EXPERT_TOKENS = new Set((process.env.EXPERT_TOKENS ?? "").split(",").map((t) => t.trim()).filter(Boolean));
const limiter = createRateLimiter({ limit: Number(process.env.RATE_LIMIT ?? 60), windowMs: 3_600_000 });
// Log without text: timestamp, verdicts, counts only.
const service = createVerificationService({
  directory, keys: KEYS, customers: CUSTOMERS, log: (e) => console.log("verify", JSON.stringify(e)),
  report: { keyId: KEY_ID, privateKey, service: `${BASE_URL}/v1/verify` },
});

/** Machine-readable signpost: which markers exist and where to verify them (Code 3.4 ii). */
const signpost = () => ({
  provider: PROVIDER.name,
  purpose: "Marking of AI-generated chatbot responses under Art. 50(2) EU AI Act",
  about: `${BASE_URL}/about`,
  checkPage: `${BASE_URL}/check`,
  verify: { url: `${BASE_URL}/v1/verify`, method: "POST", body: { text: "…" }, freeOfCharge: true },
  keys: `${BASE_URL}/.well-known/textsiegel-keys.json`,
  records: `${BASE_URL}/v1/records/{responseId}`,
  marker: {
    carriers: ["U+200C", "U+200D", "U+2060"],
    encoding: "base 3 (ZWNJ=0, ZWJ=1, Word Joiner=2), run of 8+ characters behind a sentence or line end",
    formats: [
      { version: "0xF2", characters: 101, payload: "version | customer ID (4) | response ID (6) | content (3) | HMAC (6)", verification: "via the verification service only" },
      { version: "0xF3", characters: 81, payload: "version | key ID | response ID (8) | sentence number (2) | sentence hash (4)", verification: "public: record + Ed25519 key" },
    ],
  },
  specification: "https://github.com/kokosnuss7777/textsiegel",
});

function isExpert(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const auth = String(req.headers.authorization ?? "");
  return auth.startsWith("Bearer ") && EXPERT_TOKENS.has(auth.slice(7).trim());
}

// ---------------------------------------------------------------------------
// Test page: sample responses and diagnostic tests (German content, as the marker classes are German)

// Additional response with Markdown structures where the signature lands behind a line end.
const EXTRA = [
  {
    id: "markdown",
    text: `## Öffnungszeiten im Überblick

| Tag | Zeiten |
|---|---|
| Montag bis Freitag | 8 bis 18 Uhr |
| Samstag | 9 bis 14 Uhr |

---

**Wichtig:** Zudem haben wir am 24. Dezember geschlossen.

1. Wählen Sie im Shop den gewünschten Artikel aus.
2. Legen Sie ihn in den Warenkorb.
3. Wählen Sie *Abholung vor Ort*.

Mehr dazu finden Sie in unseren [FAQ](https://www.lindenhof-beispiel.de/faq). Für Rückfragen nutzen Sie gerne \`service@lindenhof-beispiel.de\`.`,
  },
];

// Character test: which invisible characters and space variants survive a target program?
// Each candidate appears three times in its own line; every code point is counted.
// "in" = inside a word (invisible), "space" = instead of a regular space.
const CHARACTERS: { name: string; cp: number; at: "in" | "space" }[] = [
  { name: "VS1 (U+FE00, BMP)", cp: 0xfe00, at: "in" },
  { name: "VS17 (U+E0100, plane 14)", cp: 0xe0100, at: "in" },
  { name: "ZWSP (U+200B)", cp: 0x200b, at: "in" },
  { name: "ZWNJ (U+200C)", cp: 0x200c, at: "in" },
  { name: "ZWJ (U+200D)", cp: 0x200d, at: "in" },
  { name: "Word Joiner (U+2060)", cp: 0x2060, at: "in" },
  { name: "Function Application (U+2061)", cp: 0x2061, at: "in" },
  { name: "Invisible Times (U+2062)", cp: 0x2062, at: "in" },
  { name: "Invisible Separator (U+2063)", cp: 0x2063, at: "in" },
  { name: "Invisible Plus (U+2064)", cp: 0x2064, at: "in" },
  { name: "CGJ (U+034F)", cp: 0x034f, at: "in" },
  { name: "Soft hyphen (U+00AD)", cp: 0x00ad, at: "in" },
  { name: "ZWNBSP/BOM (U+FEFF)", cp: 0xfeff, at: "in" },
  { name: "Mongolian Vowel Sep. (U+180E)", cp: 0x180e, at: "in" },
  { name: "LRM (U+200E)", cp: 0x200e, at: "in" },
  { name: "Tag character (U+E0041)", cp: 0xe0041, at: "in" },
  { name: "No-break space (U+00A0)", cp: 0x00a0, at: "space" },
  { name: "Narrow no-break space (U+202F)", cp: 0x202f, at: "space" },
  { name: "Figure space (U+2007)", cp: 0x2007, at: "space" },
  { name: "Punctuation space (U+2008)", cp: 0x2008, at: "space" },
  { name: "Thin space (U+2009)", cp: 0x2009, at: "space" },
  { name: "Hair space (U+200A)", cp: 0x200a, at: "space" },
];
const CHARACTER_REPEAT = 3;

function characterText(): string {
  const lines = CHARACTERS.map((c, i) => {
    const ch = String.fromCodePoint(c.cp);
    const body = c.at === "in" ? `garden${ch}house, flower${ch}pot, lawn${ch}mower` : `garden and${ch}house with${ch}flowers and${ch}lawn`;
    return `${i + 1}. ${c.name}: ${body}.`;
  });
  return `Character test: each line carries a different character three times. Please copy the whole answer.\n\n${lines.join("\n")}`;
}

// Run test: single variation selectors survive Gmail, a run of 17 does not. Which length, position or mix is
// filtered? Each case is on its own line "Rk: …" and is counted per line.
const VS_BYTES = [0xa1, 0x00, 0x00, 0x00, 0x65, 0x2a, 0x9c, 0x10, 0x07, 0xd3, 0x41, 0x88, 0x05, 0xf0, 0x3b, 0x72, 0xc4]; // signature-like
const vsOf = (b: number) => String.fromCodePoint(b < 16 ? 0xfe00 + b : 0xe0100 + (b - 16));
const vsRun = (n: number, kind: "mix" | "bmp" | "astral" = "mix") =>
  VS_BYTES.slice(0, n).map((b) => vsOf(kind === "bmp" ? b % 16 : kind === "astral" ? 16 + (b % 240) : b)).join("");
const RUNS: { name: string; line: (vs: (n: number, k?: "mix" | "bmp" | "astral") => string) => string; expected: number }[] = [
  { name: "1 VS inside a word", line: (v) => `garden${v(1)}house and flowerpot.`, expected: 1 },
  { name: "1 VS after a period", line: (v) => `garden house and flowerpot.${v(1)} Next`, expected: 1 },
  { name: "2 VS after a period", line: (v) => `garden house and flowerpot.${v(2)} Next`, expected: 2 },
  { name: "4 VS after a period", line: (v) => `garden house and flowerpot.${v(4)} Next`, expected: 4 },
  { name: "8 VS after a period", line: (v) => `garden house and flowerpot.${v(8)} Next`, expected: 8 },
  { name: "17 VS after a period (like a signature)", line: (v) => `garden house and flowerpot.${v(17)} Next`, expected: 17 },
  { name: "17 VS inside a word", line: (v) => `garden${v(17)}house and flowerpot.`, expected: 17 },
  { name: "17 VS after a letter at the sentence end", line: (v) => `garden house and flowerpot${v(17)}. Next`, expected: 17 },
  { name: "17 VS, BMP only, after a period", line: (v) => `garden house and flowerpot.${v(17, "bmp")} Next`, expected: 17 },
  { name: "17 VS, plane 14 only, after a period", line: (v) => `garden house and flowerpot.${v(17, "astral")} Next`, expected: 17 },
  { name: "17 VS at the line end", line: (v) => `garden house and flowerpot.${v(17)}`, expected: 17 },
  { name: "17 VS spread over words (1 each)", line: () => {
      const words = "In the garden there are many colourful flowers and large potted plants next to the new garden house made of light wood with a roof".split(" ");
      return words.map((w, i) => w + (i < 17 ? vsOf(VS_BYTES[i]) : "")).join(" ") + ".";
    }, expected: 17 },
  { name: "17 VS in groups of 4 separated by ZWNJ", line: (v) => `garden house and flowerpot.${[...v(17)].map((c, i) => (i && i % 4 === 0 ? "‌" : "") + c).join("")} Next`, expected: 17 },
];

function runText(): string {
  return `Run test: each line contains a different run of invisible characters. Please copy the whole answer.\n\n${RUNS.map((f, i) => `R${i + 1}: ${f.line(vsRun)}`).join("\n\n")}`;
}

/** Evaluate the run test per line: variation selectors between "Rk:" and "R(k+1):". */
function countRuns(text: string) {
  return RUNS.map((f, i) => {
    const start = text.indexOf(`R${i + 1}:`);
    const end = i + 1 < RUNS.length ? text.indexOf(`R${i + 2}:`, start) : text.length;
    const seg = start === -1 ? "" : text.slice(start, end === -1 ? text.length : end);
    return { name: f.name, expected: f.expected, found: start === -1 ? -1 : [...seg].filter((c) => VS_ONE.test(c)).length };
  });
}
const VS_ONE = /^[\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]$/u;

// Carrier test: Word for Mac shows variation selectors as boxes, but not ZWNJ, ZWJ, Word Joiner and CGJ.
// Do these work as a signature alphabet? Singly, as uniform runs and as signature-like mixes. Counted per line,
// including the order.
const CARRIERS = [
  { name: "ZWNJ", ch: "‌" },
  { name: "ZWJ", ch: "‍" },
  { name: "WJ", ch: "⁠" },
  { name: "CGJ", ch: "͏" },
];
const mixed = (n: number, seed: number) => {
  let x = seed;
  return Array.from({ length: n }, () => {
    x = (x * 1103515245 + 12345) >>> 0;
    return CARRIERS[(x >>> 16) & 3].ch;
  }).join("");
};
const CARRIER_CASES: { name: string; seq: string; line: (s: string) => string }[] = [
  ...CARRIERS.map((t) => ({ name: `${t.name} single, after a period`, seq: t.ch, line: (s: string) => `garden house and flowerpot.${s} Next` })),
  ...CARRIERS.map((t) => ({ name: `${t.name} ×17 after a period`, seq: t.ch.repeat(17), line: (s: string) => `garden house and flowerpot.${s} Next` })),
  { name: "mix ×68 after a period (like a signature)", seq: mixed(68, 1), line: (s) => `garden house and flowerpot.${s} Next` },
  { name: "mix ×68 at the line end", seq: mixed(68, 2), line: (s) => `garden house and flowerpot.${s}` },
  { name: "mix ×68 inside a word", seq: mixed(68, 3), line: (s) => `garden${s}house and flowerpot.` },
  { name: "mix ×34 after a period", seq: mixed(34, 4), line: (s) => `garden house and flowerpot.${s} Next` },
];

function carrierText(): string {
  return `Carrier test: each line contains different invisible characters. Please copy the whole answer.\n\n${CARRIER_CASES.map((f, i) => `C${i + 1}: ${f.line(f.seq)}`).join("\n\n")}`;
}

/** Evaluate the carrier test per line: count per character and whether order and content match exactly. */
function countCarriers(text: string) {
  const set = new Set(CARRIERS.map((t) => t.ch));
  return CARRIER_CASES.map((f, i) => {
    const start = text.indexOf(`C${i + 1}:`);
    const next = i + 1 < CARRIER_CASES.length ? text.indexOf(`C${i + 2}:`, start) : -1;
    const seg = start === -1 ? "" : text.slice(start, next === -1 ? text.length : next);
    const found = [...seg].filter((c) => set.has(c)).join("");
    const detail = CARRIERS.map((t) => `${t.name} ${[...found].filter((c) => c === t.ch).length}/${[...f.seq].filter((c) => c === t.ch).length}`)
      .filter((d) => !d.endsWith(" 0/0")).join(", ");
    return { name: f.name, expected: f.seq.length, found: start === -1 ? -1 : found.length, exact: found === f.seq, detail };
  });
}

const DIAGNOSTIC_TESTS = ["character-test", "run-test", "carrier-test"];
const ANSWERS = [
  ...SAMPLES, ...EXTRA,
  { id: "character-test", text: characterText() }, { id: "run-test", text: runText() }, { id: "carrier-test", text: carrierText() },
];

/** Create a response like the widget: LLM stream in small chunks → StreamMarker → sentence-by-sentence output. */
async function answer(id: string, publicMode = false) {
  const s = ANSWERS.find((a) => a.id === id) ?? ANSWERS[0];
  // Diagnostic tests are delivered unmarked: marking and signature would distort the counts.
  if (DIAGNOSTIC_TESTS.includes(s.id)) return { id: s.id, customerId: CUSTOMER.id, responseId: "", chunks: [s.text] };
  const provenance = publicMode ? createProvenance({ keyId: KEY_ID, privateKey, customer: PSEUDONYM, model: "sample response" }) : undefined;
  const marker = new StreamMarker(provenance ? { key: CUSTOMER.key, provenance } : { key: CUSTOMER.key, signature: { customerId: CUSTOMER.id } });
  const chunks: string[] = [];
  for (let i = 0; i < s.text.length; i += 6) {
    const ready = marker.push(s.text.slice(i, i + 6));
    if (ready) chunks.push(ready);
  }
  const rest = marker.flush();
  if (rest) chunks.push(rest);
  if (provenance) await directory.put(provenance.finish());
  return { id: s.id, customerId: CUSTOMER.id, responseId: marker.responseId, mode: provenance ? "public" : "internal", chunks };
}

/** Verify plus diagnostics: what is left of the invisible part and of the no-break spaces. */
async function check(text: string) {
  const v = verify(text, CUSTOMERS);
  const provenance = await verifyPublic(text, (id) => directory.get(id), Object.fromEntries(KEYS.map((k) => [k.keyId, k.publicKey])));
  const runs = [...text.matchAll(SIGNATURE_RE)].map((m) => ({ len: [...m[0]].length, ok: [16, 20].includes(fromRun(m[0]).length) })); // 0xF3, 0xF2
  return {
    verdict: provenance.sentences.length ? provenance.verdict : v.verdict,
    signature: v.signature,
    provenance,
    statistic: v.statistic && {
      customerId: v.statistic.customerId,
      points: v.statistic.points,
      matches: v.statistic.matches,
      pAdjusted: v.statistic.pAdjusted,
    },
    diagnostics: {
      characters: [...text].length,
      markerRuns: runs.length,
      markersComplete: runs.filter((r) => r.ok).length,
      markerCharacters: runs.reduce((a, r) => a + r.len, 0),
      nbsp: (text.match(/ /g) ?? []).length,
      narrowNbsp: (text.match(/ /g) ?? []).length,
      zeroWidth: (text.match(/[​-‍⁠﻿]/g) ?? []).length,
    },
    runTest: countRuns(text),
    carrierTest: countCarriers(text),
    characterTest: CHARACTERS.map((c) => ({ name: c.name, expected: CHARACTER_REPEAT, found: [...text].filter((ch) => ch.codePointAt(0) === c.cp).length })),
  };
}

// ---------------------------------------------------------------------------
// HTTP

const json = (body: unknown, status = 200) =>
  [status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }, JSON.stringify(body)] as const;
const html = async (file: string) => [200, { "content-type": "text/html; charset=utf-8" }, await readFile(new URL(`./${file}`, import.meta.url), "utf8")] as const;

/** Read the request body, at most 1 MB. */
async function readBody(req: AsyncIterable<Buffer>): Promise<string> {
  let body = "";
  for await (const c of req) {
    body += c;
    if (body.length > 1_000_000) throw new Error("request too large");
  }
  return body;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let out: readonly [number, Record<string, string>, string];
  try {
    if (!TEST_PAGE && (url.pathname === "/" || url.pathname.startsWith("/api/"))) {
      out = [404, { "content-type": "text/plain" }, "Not found"];
    } else if (req.method === "GET" && url.pathname === "/") {
      out = await html("test-page.html");
    } else if (req.method === "GET" && url.pathname === "/api/answers") {
      out = json(ANSWERS.map((a) => a.id));
    } else if (req.method === "GET" && url.pathname === "/api/answer") {
      out = json(await answer(url.searchParams.get("id") ?? "", url.searchParams.get("mode") === "public"));
    } else if (req.method === "POST" && url.pathname === "/api/check") {
      out = json(await check(String(JSON.parse(await readBody(req)).text ?? "")));
    } else if (req.method === "GET" && url.pathname === "/check") {
      out = await html("check.html");
    } else if (req.method === "GET" && url.pathname === "/about") {
      out = await html("about.html");
    } else if (req.method === "GET" && url.pathname === "/config.js") {
      // On the server the API has the same origin; GitHub Pages gets its own config.js.
      out = [200, { "content-type": "text/javascript; charset=utf-8" }, `window.TEXTSIEGEL = ${JSON.stringify({ api: "", provider: PROVIDER.name, contact: PROVIDER.contact })};\n`];
    } else if (req.method === "GET" && url.pathname === "/.well-known/textsiegel.json") {
      out = json(signpost());
    } else if (req.method === "GET" && url.pathname === "/.well-known/textsiegel-keys.json") {
      out = json(service.keysDocument());
    } else if (req.method === "OPTIONS" && url.pathname === "/v1/verify") {
      out = [204, { "access-control-allow-origin": "*", "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type, authorization" }, ""];
    } else if (req.method === "GET" && url.pathname.startsWith("/v1/records/")) {
      const record = await service.getRecord(url.pathname.slice("/v1/records/".length));
      out = record ? json(record) : json({ error: "not found" }, 404);
    } else if (req.method === "POST" && url.pathname === "/v1/verify") {
      const expert = isExpert(req);
      if (!limiter.allow(req.socket.remoteAddress ?? "?", Date.now(), { expert })) {
        out = json({ error: "Too many checks. Please try again later. Authorities, press and researchers get unlimited access – see /about." }, 429);
      } else {
        out = json(await service.verify(String(JSON.parse(await readBody(req)).text ?? ""), { expert }));
      }
    } else {
      out = [404, { "content-type": "text/plain" }, "Not found"];
    }
  } catch (e) {
    out = [500, { "content-type": "text/plain" }, String(e)];
  }
  res.writeHead(out[0], out[1]).end(out[2]);
}).listen(PORT, HOST, () => console.log(`textsiegel: http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}  (customer ${CUSTOMER.id})`));
