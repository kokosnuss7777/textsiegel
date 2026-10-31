# textsiegel

Invisible, sentence-bound marking of AI-generated chatbot text – for providers who must mark their outputs under **Art. 50(2) EU AI Act** but have no access to the model's sampling (hosted APIs without `logprobs`/`logit_bias`, customer-supplied API keys, any model).

textsiegel works **after generation**: no extra API call, no model access, works with every model and streaming. It combines

| Layer | Principle | Evidence | Survives |
|---|---|---|---|
| **Signature** (0xF2) | Invisible characters (ZWNJ, ZWJ, Word Joiner) behind every sentence carry an HMAC-signed response ID bound to the sentence content | deterministic, one sentence is enough | copy-paste, partial copies, Gmail, Outlook Web, Word, Google Docs – not filters that delete all zero-width characters, not retyping |
| **Public provenance** (0xF3, optional) | Same carriers; marker points to an Ed25519-signed record (hashes only, no text) | anyone can verify with the public key | as above; needs the record directory |
| **Choice-Point-Mark** | At choice points ("zudem/außerdem", "ca./etwa" before numbers, no-break spaces …) `HMAC(key, class + previous word)` selects the variant | statistical (p-value), needs many choice points | removal of invisible characters; the lexical part also retyping – not rewording |

> The Choice-Point-Mark classes are currently defined for **German** text. The signature and provenance layers are language-independent.

Verification results distinguish **"signed"** (genuine and unchanged), **"signed-altered"** (genuine marker, but the sentence was edited or the marker was moved to other text) and **"none"**.

## Quick start

Node ≥ 22.18, no runtime dependencies.

```sh
npm install
npm test                 # 82 tests (Node)
npm run test:browser     # 30 browser tests (Chromium, Firefox, WebKit); once: npx --prefix e2e playwright install
npm run server           # test page, check page and API on http://localhost:8787
npm run demo             # offline measurement on sample texts → report/results-offline.*
```

## Using the library

Install directly from GitHub (built during installation):

```sh
npm install github:kokosnuss7777/textsiegel#v0.1.0
```

```ts
import { StreamMarker, verify } from "textsiegel";

// one marker per response; key and customer ID stay on the server
const marker = new StreamMarker({ key: process.env.MARK_KEY!, signature: { customerId: 1 } });
for await (const delta of llmStream) {
  const ready = marker.push(delta); // marked and signed sentence by sentence
  if (ready) sendToWidget(ready);
}
sendToWidget(marker.flush());

// verification
const result = verify(text, [{ id: 1, key: process.env.MARK_KEY! }]);
// result.verdict: "signed" | "signed-altered" | "statistical" | "none"
```

The marker holds back text until a sentence end, so the widget shows the answer sentence by sentence.

**Public provenance** instead of the HMAC signature – anyone can verify, without your secret:

```ts
import { createProvenance, verifyPublic } from "textsiegel";

const provenance = createProvenance({ keyId: 1, privateKey, customer: "customer-7f3a", model });
const marker = new StreamMarker({ key: process.env.MARK_KEY!, provenance });
// … push()/flush() as above …
await directory.put(provenance.finish()); // signed record (hashes only), also after an aborted stream

const result = await verifyPublic(text, fetchRecord, { 1: publicKey });
// per sentence: origin (record + signature + marker hash) and unchanged (sentence matches its hash)
```

**Other languages:** [`spec/test-vectors.json`](spec/test-vectors.json) contains fixed inputs and outputs (normalization, base-3 encoding, signature 0xF2, Choice-Point-Mark, provenance 0xF3). A port (Python, PHP, …) is correct if it reproduces all vectors. The format is described on the [about page](server/about.html). Regenerate with `npm run test-vectors`.

**Integrating into an existing chatbot:** see [AGENTS.md](AGENTS.md) – where to mark, history and storage, widget, verification, non-Node backends, pitfalls and an acceptance checklist. Coding agents read it automatically.

## How it works

- **Carriers:** ZWNJ (U+200C) = 0, ZWJ (U+200D) = 1, Word Joiner (U+2060) = 2, base 3, as a run directly behind a sentence or line end. They were chosen with the diagnostic tests on the test page: invisible in Word for Mac and surviving Gmail and Outlook Web singly, as runs and as mixes. Variation selectors (the usual choice) fail: Word shows them as boxes, Outlook Web removes VS17–VS256 and Gmail removes runs of 8 or more.
- **Signature 0xF2** (20 bytes, 101 characters): version · customer ID (4) · response ID (6) · content checksum (3) · HMAC (6). The content checksum covers letters and digits of the sentence only – formatting, quotes, space types, Markdown and list numbers do not change it. Forging without the key: 2⁻⁴⁸ per attempt.
- **Provenance 0xF3** (16 bytes, 81 characters): version · key ID · response ID (8) · sentence number (2) · sentence hash (4). The record `{ keyId, responseId, customer, createdAt, salt, model, sentenceHashes }` is signed with Ed25519 (canonical JSON) and contains no text.
- **Placement:** never in code, URLs, links, HTML, email addresses or quotes; not behind a URL at a sentence end (it would become part of the autolink); not in Markdown table delimiter rows, thematic breaks or setext underlines; inside the last table cell instead of behind it.
- **Choice-Point-Mark:** exact p-value (Poisson binomial) per layer (lexical, typography) and combined; the decision uses the smallest one, corrected for three tests and the number of customer keys. Marked means p < 10⁻⁴.

## Verification service (EU Code of Practice)

`server/server.ts` provides the verification service, a public check page and an about page. Mapping to the Code of Practice on marking and labelling of AI-generated content:

| Code | Implementation |
|---|---|
| 2.1.1 free of charge; authorities, press, research unlimited | `POST /v1/verify` free; rate limit per IP (`RATE_LIMIT`, default 60/h), expert tokens (`EXPERT_TOKENS`) unlimited |
| 2.1.2 public interface | `/check`: whole texts, verdict as text, accessible (labels, focus, live region) |
| 2.1.2 signed report | report with SHA-256 of the text, service identifier, timestamp and result, Ed25519-signed, downloadable; `verifyReport()` |
| 2.1.2 statistic for free-form text restricted to experts | p-value and "statistical" only with an expert token |
| 2.1.3 zero retention | text only in memory; log contains timestamp, verdicts and counts only (tested) |
| 2.3 clear results, technique named | verdict, explanation, technique, sentences with marker/confirmed/unchanged |
| 3.4 public information, signpost | `/about` and `/.well-known/textsiegel.json` (marker format, API, keys) |

Endpoints: `GET /check`, `GET /about`, `GET /.well-known/textsiegel.json`, `GET /.well-known/textsiegel-keys.json`, `GET /v1/records/{responseId}`, `POST /v1/verify { text }`. Configuration via environment variables, see the header of [`server/server.ts`](server/server.ts) and [`deploy/textsiegel.env.example`](deploy/textsiegel.env.example).

## Deployment: GitHub Actions, GitHub Pages, VPS

| Part | Where | How |
|---|---|---|
| Tests | GitHub Actions | on every push: Node tests, build, browser tests |
| Check page + about page | GitHub Pages | on push to `main`; API address, provider name and contact from the repository variables `SERVICE_URL`, `PROVIDER_NAME`, `CONTACT` |
| Verification service | VPS (Docker) | Actions builds `ghcr.io/kokosnuss7777/textsiegel`; a systemd timer on the VPS pulls new versions every 5 minutes – GitHub needs no access to the VPS |

One-time setup on the VPS (Docker required):

```sh
git clone https://github.com/kokosnuss7777/textsiegel && sudo bash textsiegel/deploy/install.sh https://your-service-url
```

This creates `/opt/textsiegel` (compose file, `textsiegel.env` with a random key, Ed25519 key in `data/`) and enables the update timer. The service listens on `127.0.0.1:8790`; expose it with a reverse proxy, `tailscale serve` (tailnet only) or `tailscale funnel` (public). `MARK_KEY` must be the key your chatbot marks with.

## Measurements

Manual copy-paste tests with the test page (received messages where applicable):

| Target | Signature survives | Invisible |
|---|---|---|
| Gmail, Outlook Web | ✅ (current carriers confirmed with the carrier test) | ✅ |
| Word for Mac, Word Online, Google Docs (also after reopening) | ✅ | ✅ (Word for Mac verified with the current encoding) |
| WhatsApp Web, TextEdit | ✅ | ✅ |
| NVDA, VoiceOver | – | no audible difference |
| Chromium, Firefox, WebKit | ✅ (automated) | ✅ (automated: same line geometry) |

Online run with a 27B model (Choice-Point-Mark only): 2.2 choice points per 100 tokens; 2 of 5 responses over 200 tokens detected; none after retyping or rewording; no false positives. Choice-Point-Mark alone is therefore not enough – the signature is the main layer, the statistic the fallback for long responses whose invisible characters were removed.

## Limits

- No method implemented here survives rewording by an LLM (the literature has more robust approaches, without guarantees).
- Programs that delete all zero-width characters remove the signature; selecting and copying in a browser turns no-break spaces into regular ones (typography layer of Choice-Point-Mark).
- The HMAC signature can only be verified by the key holder; the public provenance needs the record directory. A sentence copied only partially (without its end) carries no signature.
- 0 false positives in 2,000 checks with random keys do not prove a false-positive rate below 10⁻⁴ for real foreign texts.
- Choice-Point-Mark classes exist for German only.
- This is not legal advice. Whether a particular deployment satisfies Art. 50(2) depends on the whole system and its documentation.

## License

MIT, see [LICENSE](LICENSE).
