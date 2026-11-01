# textsiegel specification

Status: describes the behaviour of v0.1.0 as built (recorded 2026-10-31 after the fact). Normative for byte formats are the test vectors in [`spec/test-vectors.json`](../../spec/test-vectors.json); where this text and the vectors disagree, the vectors win and this text is wrong. Known deviations between intended and actual behaviour are open tickets, listed in [Known deviations](#known-deviations). Terms: [GLOSSARY.md](../../GLOSSARY.md).

## 1. Purpose and scope

textsiegel marks chatbot responses as AI-generated after generation, without access to the model ([ADR-0001](../adr/0001-mark-after-generation.md)), and verifies such markings. It has three parts: the marking library, the verification functions, and the verification service.

Out of scope: robustness against rewording; marking of user input, prompts or tool output; Choice-Point-Mark for languages other than German.

## 2. Carriers and encoding

- Carriers: U+200C = 0, U+200D = 1, U+2060 = 2 ([ADR-0002](../adr/0002-carriers-zwnj-zwj-wj.md)).
- A payload of *n* bytes is read as a big-endian unsigned integer and written in base 3, most significant digit first, with a fixed length: 20 bytes → 101 carriers, 16 bytes → 81 carriers.
- A run is a maximal sequence of 8 or more carriers. Runs of other lengths than 81 or 101 are remnants: ignored by verification, removed by `stripSignature`. Fewer than 8 carriers in a row are never touched.
- The first payload byte is the version byte. A verifier ignores runs with an unknown version.

## 3. Content key

`contentKey(sentence)`:

1. Unicode NFKC.
2. Remove a leading sequence of Markdown block markers: `#`–`######` + space, `>`, list bullets `-*+` + space, ordered list numbers (one or more digits followed by `.` or `)`, regex `\d+[.)]`) + space.
3. Lowercase.
4. Keep only letters (`\p{L}`) and digits (`\p{N}`).

## 4. Signature (0xF2)

Payload, 20 bytes:

| Bytes | Field |
|---|---|
| 0 | version `0xF2` |
| 1–4 | customer ID, uint32 big-endian |
| 5–10 | response ID, 6 random bytes per response |
| 11–13 | content tag = first 3 bytes of HMAC-SHA256(mark key, `"textsiegel-inhalt-v1"` ‖ bytes 1–10 ‖ UTF-8 contentKey(sentence)) |
| 14–19 | MAC = first 6 bytes of HMAC-SHA256(mark key, `"textsiegel-signatur-v1"` ‖ bytes 0–13) |

`sentence` is the delivered text of the sentence the signature follows, from its start (after the previous sentence end, line break or marker) to its end.

## 5. Provenance marker (0xF3) and record

Payload, 16 bytes: version `0xF3` · key ID (1) · response ID (8) · sentence number (2, big-endian, from 0) · sentence hash (4) = first 4 bytes of SHA-256(salt ‖ UTF-8 contentKey(sentence)).

Record per response, canonical JSON (keys sorted, no whitespace), signed with Ed25519. Field list in schema notation, not literal JSON (`?` = omitted when absent, `[]` = array):

```
{ v: 3, keyId, responseId, customer, createdAt, salt, model?, sentenceHashes[] }
```

`salt` is 16 random bytes (hex) per response; `model` is omitted when unknown. The record contains no text. A record is final when the response is finished, also after an aborted stream.

## 6. Placement

A marker is placed directly behind the end of a sentence or line of the delivered text, except:

- inside protected ranges: fenced code (backticks), inline code, URLs, e-mail addresses, HTML tags, Markdown link targets, quotations (an opening and a matching closing quotation mark less than 400 characters apart; longer quotations are not protected, ticket 13);
- directly behind a URL at a sentence end (it would join the autolink); a URL counts if it starts with `http://`, `https://` or `www.` within the 300 characters before the position and contains no whitespace up to it (ticket 17);
- on Markdown table delimiter rows, thematic breaks and setext underlines; in a table row the marker goes into the last cell, before the closing `|`.

Markdown that renders the same without markers must render the same with markers (see tickets 12, 14–17 for known gaps).

## 7. Choice-Point-Mark

- Classes ([`src/classes.ts`](../../src/classes.ts)) define equivalent variants in two layers, `lexical` and `typography`, for German text. Protected ranges (§6) are never changed, with one exception: the quote class rewrites the quotation marks of a quotation (its delimiters) while the quoted content stays protected.
- At a choice point, the variant is selected by HMAC-SHA256(mark key, `classId ‖ 0x00 ‖ context ‖ 0x00 ‖ "1"|"0"` (sentence start)); the first 4 bytes as uint32 big-endian modulo the number of allowed variants pick the variant. Context is the previous word or number (lowercase), `^` at text start. Classes marked `consistent` and the quote class use context `*` and sentence start `"0"` instead, so one variant holds for the whole text.
- Detection counts hits per layer; the p-value is the exact Poisson-binomial tail per layer and combined. The smallest of the three, multiplied by 3 and by the number of keys tried, is compared with α = 10⁻⁴. Marked means p < α.
- Choice-Point-Mark is optional per call (`layers`, `disabledClasses`); without active classes, the text is returned unchanged and only signed.

## 8. Streaming

`StreamMarker.push(delta)` returns complete, marked sentences and holds back the rest; `flush()` marks and returns the remainder. Streaming and non-streaming marking of the same text produce text that verifies identically. One `StreamMarker` per response.

## 9. Verification

### 9.1 Signature

For each 101-carrier run with version `0xF2`: check the MAC with the mark key of the customer ID. For a valid signature, try the candidate sentences ending at the run: from the previous sentence or line end, from the previous marker, from the line start, and from each of the last 80 word starts on the line. The content matches if the content tag of any candidate equals the stored tag.

Verdict:

| Condition | Verdict |
|---|---|
| ≥ 1 valid signature and ≥ 1 content match | `signed` |
| ≥ 1 valid signature, no content match | `signed-altered` |
| no valid signature, Choice-Point-Mark marked | `statistical` |
| otherwise | `none` |

### 9.2 Public provenance

For each 81-carrier run with version `0xF3`: fetch the record by response ID (once per response ID and verification), check its Ed25519 signature with the public key of the key ID. A marker has `origin` if the record is valid, its key ID equals the marker's and the record's sentence hash at the sentence number equals the marker's sentence hash. It is `unchanged` if it has origin and a candidate sentence (as in 9.1) hashes to that sentence hash.

| Condition | Public verdict |
|---|---|
| no 0xF3 marker | `none` |
| markers, none with origin | `unverified` |
| ≥ 1 marker unchanged | `verified` |
| origin, none unchanged | `altered` |

`verified` therefore means "at least one sentence confirmed unchanged", not "the whole text unchanged"; the per-sentence counts say how many. The check page must not present a partial result as fully unchanged (ticket 06).

## 10. Verification service

Endpoints:

| Method and path | Purpose |
|---|---|
| `GET /check` | Public check page |
| `GET /about` | Explanation, marker format, limits, expert access |
| `GET /.well-known/textsiegel.json` | Signpost: format, API, keys |
| `GET /.well-known/textsiegel-keys.json` | Ed25519 public keys (JWK, `validFrom`, `validTo`) |
| `GET /v1/records/{responseId}` | Provenance record (16 hex characters) |
| `POST /v1/verify {"text": "…"}` | Verification; CORS `*` |

`POST /v1/verify` and the test page's `POST /api/check` take `{"text": "…"}` with at most `MAX_TEXT_LENGTH` = 100,000 characters (UTF-16 code units); the body may be at most 1,000,000 characters. Above either limit the answer is `413` before any processing. Invalid JSON, a body without a string `text` and a malformed request target get `400`. Any other error gets `500` with a fixed message; neither answers nor logs contain error messages, paths or submitted text.

Protected-range detection, quotation pair search and the Choice-Point-Mark scan run in time linear in the text length (up to a logarithmic factor), so the length limit bounds the work per check.

`POST /v1/verify` returns the public verdict, the provenance details, the internal verdict and signature counts, and a signed report. The statistical result is included only for experts (`Authorization: Bearer <expert token>`). Non-experts are limited to `RATE_LIMIT` checks per hour per socket IP address (default 60) and get `429` above it. Behind a reverse proxy all clients share the proxy's address and therefore one limit (ticket 08).

Report (schema notation, not literal JSON): `{ type: "textsiegel-report", version: 1, service, timestamp, contentHash: "sha256:…", result: { verdict, techniques, sentencesWithMarker, verified, unchanged } }`, signed with Ed25519 over its canonical JSON; verifiable with `verifyReport()` and the key document.

Retention: submitted text exists only in memory during the request. The log line contains timestamp, verdicts, marker and response counts only – never text or hashes of it ([ADR-0008](../adr/0008-verification-service-code-of-practice.md)).

## 11. Conformance

An implementation (port) conforms if it reproduces every entry of `spec/test-vectors.json`. A change to any byte format, the content key, the HMAC contexts or the sentence hash requires a new version byte and new vectors; existing versions keep their meaning and stay verifiable.

## Known deviations

Open tickets where v0.1.0 does not meet this text or where this text is under review:

- Service robustness: [07](../../.scratch/textsiegel/issues/07-utf8-split-across-chunks.md), [08](../../.scratch/textsiegel/issues/08-rate-limit-behind-proxy.md).
- Content binding under review ([18](../../.scratch/textsiegel/issues/18-decide-content-binding-v2.md)): [03](../../.scratch/textsiegel/issues/03-content-key-ignores-decimal-and-sign.md), [04](../../.scratch/textsiegel/issues/04-prefix-edit-passes-content-binding.md), [11](../../.scratch/textsiegel/issues/11-rendered-links-break-content-binding.md).
- Verdict combination and record cache: [06](../../.scratch/textsiegel/issues/06-check-page-overstates-unchanged.md), [09](../../.scratch/textsiegel/issues/09-forged-f3-overrides-hmac-verdict.md), [10](../../.scratch/textsiegel/issues/10-forged-key-id-poisons-record-cache.md).
- Markdown placement gaps: [12](../../.scratch/textsiegel/issues/12-tilde-and-indented-code-unprotected.md), [13](../../.scratch/textsiegel/issues/13-long-quotes-get-rewritten.md), [14](../../.scratch/textsiegel/issues/14-spaced-thematic-break-rewritten.md), [15](../../.scratch/textsiegel/issues/15-short-setext-underline-broken.md), [16](../../.scratch/textsiegel/issues/16-atx-closing-hashes-visible.md), [17](../../.scratch/textsiegel/issues/17-long-autolink-gets-marker.md).
- Key rotation: [19](../../.scratch/textsiegel/issues/19-retired-keys-stay-verifiable.md).
