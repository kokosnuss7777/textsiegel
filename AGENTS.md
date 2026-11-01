# AGENTS.md – integrating textsiegel into a chatbot

Instructions for coding agents (and humans) who add textsiegel to an existing chatbot backend and widget. Read [README.md](README.md) for what the method does; this file says **where and how** to wire it in, what to decide first, and how to prove the integration works.

## 0. Decide before you write code

| Question | Default | Notes |
|---|---|---|
| Language of the chatbot backend? | Node/TypeScript → use the library directly (sections 2–6). | Anything else → section 8 first. |
| Which marking? | **HMAC signature (0xF2)** – no storage, verified by your own service. | Public provenance (0xF3, Ed25519) only if third parties must verify without your service; it needs a record directory (section 7). |
| One key or one per tenant? | **One `MARK_KEY` for the whole deployment**, `customerId` = tenant ID. | Per-tenant keys weaken Choice-Point-Mark detection (p-value is multiplied by the number of keys) and need key management. |
| Is a verification service running? | Yes, if you deployed `server/` (see README → Deployment). | Its `MARK_KEY` must equal the key the chatbot marks with. |

Ask the owner if any of these is unclear. Do not invent a second key.

## 1. Where marking happens

```
LLM stream ──► (your post-processing: link rewriting, filters, citations …) ──► textsiegel StreamMarker ──► widget / API response
                                                                           └─► store marked text for display
```

Rules:

- Mark **last**, after every other change to the answer text. Any change after marking breaks the content binding (verification then says "signed-altered").
- Mark **server-side**. The key never reaches the browser.
- One `StreamMarker` (or one `markResponse` call) **per response**.
- Do not mark user messages, system prompts, tool output or anything that is not shown to the end user as AI output.

## 2. Install and configure (Node)

```sh
npm install github:kokosnuss7777/textsiegel#v0.1.0
```

Environment (names are suggestions; keep them in the app's existing config system):

```
TEXTSIEGEL_MARK_KEY=<same value as MARK_KEY on the verification service>
TEXTSIEGEL_CHECK_URL=https://<verification service>/check
```

Requires Node ≥ 22.18 at runtime only if you import the TypeScript sources; the npm package ships compiled JavaScript and type definitions, so any Node version supported by the app with ES modules works.

## 3. Mark streamed responses

```ts
import { StreamMarker } from "textsiegel";

async function* markedStream(llmStream: AsyncIterable<string>, tenantId: number) {
  const marker = new StreamMarker({ key: process.env.TEXTSIEGEL_MARK_KEY!, signature: { customerId: tenantId } });
  for await (const delta of llmStream) {
    const ready = marker.push(delta); // returns complete, marked sentences (may be "")
    if (ready) yield ready;
  }
  const rest = marker.flush(); // always flush, also on errors/aborts, so the last sentence is marked
  if (rest) yield rest;
}
```

- `push()` holds text back until a sentence end. The widget therefore receives **sentence-sized chunks** instead of tokens. This is expected; do not try to bypass it.
- On client disconnect, still call `flush()` before closing if you persist the answer.
- Keep `marker.responseId` if you log responses (optional; useful for support cases).

Non-streaming responses:

```ts
import { markResponse } from "textsiegel";
const { text, responseId } = markResponse(answer, { key: process.env.TEXTSIEGEL_MARK_KEY!, signature: { customerId: tenantId } });
```

## 4. Storage, history and search

- **Display/history shown to the user:** store the **marked** text, so a reloaded conversation still carries the marking.
- **Conversation history sent back to the LLM:** remove markers first, otherwise thousands of invisible characters land in the prompt and the model may reproduce them in broken form:

  ```ts
  import { stripSignature } from "textsiegel";
  const historyForModel = messages.map((m) => (m.role === "assistant" ? { ...m, content: stripSignature(m.content) } : m));
  ```

- **Search indexes, embeddings, analytics, exports to other systems:** use `stripSignature(text)`.
- **Never mark an already marked text again.** If an answer must be re-processed, start from the stripped text.
- Databases must store UTF-8 (`utf8mb4` in MySQL is fine; the carriers are in the BMP, so plain `utf8` works too).

## 5. Widget / frontend

- Render chunks as they arrive (the existing Markdown renderer is fine; `marked` with GFM is tested, including tables and autolinks).
- **Do not strip zero-width characters** in the frontend: no sanitizer rule or regex removing `U+200C`, `U+200D`, `U+2060`. DOMPurify keeps them by default. Check any custom `replace()` on the answer text.
- Unicode normalization (NFC/NFKC) after marking is harmless (tested); avoid any other rewriting of the answer text.
- Copy button (recommended): copy the marked text, as plain text and HTML:

  ```js
  await navigator.clipboard.write([new ClipboardItem({
    "text/plain": new Blob([markedText], { type: "text/plain" }),
    "text/html": new Blob([renderedHtml], { type: "text/html" }),
  })]);
  ```

- Show the **AI interaction notice** required by Art. 50(1) EU AI Act (e.g. "You are chatting with an AI assistant") – this is separate from the marking.
- Add a small link "Check text" to the verification service's check page (`TEXTSIEGEL_CHECK_URL`).
- Accessibility: invisible markers are not announced by NVDA or VoiceOver (tested). Do not add `aria-label`s around the answer bubble; screen readers would read the label instead of the text.

## 6. Verification

The verification service (`server/` in this repo, deployed separately) answers `POST /v1/verify { "text": "…" }`. In the chatbot you normally only link to its check page. If the backend needs to verify itself (e.g. an admin tool):

```ts
import { verify } from "textsiegel";
const result = verify(text, [{ id: tenantId, key: process.env.TEXTSIEGEL_MARK_KEY! }]);
// result.verdict: "signed" | "signed-altered" | "statistical" | "none"
```

With one deployment key, pass every tenant ID with the same key, or only the relevant one.

## 7. Optional: public provenance (Ed25519)

Use only if third parties must verify without your service.

```ts
import { createProvenance, StreamMarker } from "textsiegel";
const provenance = createProvenance({ keyId: 1, privateKey, customer: pseudonymousTenantId, model });
const marker = new StreamMarker({ key: process.env.TEXTSIEGEL_MARK_KEY!, provenance });
// … push()/flush() as in section 3 …
const record = provenance.finish(); // also after an aborted stream
```

The signed `record` (hashes only, no text) must end up in the directory the verification service reads (`RECORDS_DIR`, served at `/v1/records/{id}`). **There is no write endpoint yet.** Options: run the chatbot backend and the service on the same host with a shared `RECORDS_DIR`, or add an authenticated `PUT /v1/records/{id}` to `server/server.ts` that validates the Ed25519 signature before storing. Do not expose an unauthenticated write endpoint. The private Ed25519 key belongs in the secret store, never in the repository.

## 8. Backends that are not Node

Two options – ask the owner which one:

1. **Port** the marking to the backend language. A port is correct only if it reproduces every entry in [`spec/test-vectors.json`](spec/test-vectors.json) (normalization, base-3 encoding, signature 0xF2, Choice-Point-Mark, provenance 0xF3). Port `src/text.ts`, `src/signature.ts`, `src/classes.ts` and `src/cpmark.ts` (marking and `StreamMarker`); verification can stay in the Node service. Write a test that loads the vectors.
2. **Marking sidecar:** run a small Node service next to the backend that exposes marking, e.g. `POST /v1/mark { text, customerId }` (whole responses) or a streaming variant. **It does not exist yet** – build it in `server/` with authentication (shared secret or network isolation), and keep in mind that streaming through a sidecar adds latency.

## 9. Pitfalls (seen in testing)

- Variation selectors are **not** used on purpose: Word shows them as boxes, Outlook Web and Gmail strip them. Do not "optimize" the carriers.
- A marker directly behind a URL would become part of the autolink – the library already avoids this; do not move markers manually.
- Markdown tables: the marker goes into the last cell, never into delimiter rows – again handled by the library.
- Copying by selection in browsers turns no-break spaces into regular spaces; this only weakens the statistical layer, not the signature.
- If verification says "signed-altered" for unmodified answers, something changes the text after marking (step 1).
- If verification says "none" for copied answers, something strips zero-width characters (frontend sanitizer, database collation, middleware).

## 10. Acceptance checklist

Prove each point; paste outputs into the PR description.

- [ ] Unit test: a response produced by the chatbot pipeline passes `verify(...)` with verdict `signed`.
- [ ] Unit test: `stripSignature(marked) === markText(original, { key }).text` – the visible text is unchanged except for Choice-Point-Mark choices.
- [ ] Unit test: conversation history sent to the LLM contains no characters `U+200C/U+200D/U+2060` from earlier answers.
- [ ] Manual: answer in the real widget → select and copy → paste into the check page → "Origin confirmed, unchanged".
- [ ] Manual: same via Gmail (received message) and Word.
- [ ] The widget shows the AI interaction notice and a link to the check page.
- [ ] `MARK_KEY` of chatbot and verification service are identical (checked once by verifying a real answer on the service).
- [ ] No secret (mark key, Ed25519 key) in the repository or in frontend bundles.

## 11. Legal notes for the owner (not for the agent to decide)

- Terms of use should forbid removing or altering the marking (recommended by the Code of Practice).
- Document the solution (technique, measured robustness, limits) for compliance; the README tables are a starting point.
- This file is not legal advice.

## Working on textsiegel itself

Agents changing textsiegel itself (not integrating it) follow [CLAUDE.md](CLAUDE.md): ticket, spec, ADR, TDD, PR.

```sh
npm test               # Node tests
npm run test:browser   # Playwright (Chromium, Firefox, WebKit)
npm run test-vectors   # regenerate spec/test-vectors.json after an intentional format change (bump the version byte)
npm run server         # local server with test page on :8787
```

Code, comments and docs are in English. Changes to the marker format need new test vectors and a new version byte; never change the meaning of an existing version.
