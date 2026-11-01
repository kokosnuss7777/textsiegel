# Bind every signature to its sentence

Decision by Daniel (2026-10-31, following a hint in the Codex report on Unicode steganography), implemented in the initial commits on `main` (no PR).

A signature only proving "this response ID is ours" can be copied behind any foreign text. Each signature therefore carries a 3-byte content tag over the content key of the sentence before it. The verifier reports `signed` when at least one signature matches its sentence and `signed-altered` when signatures are genuine but no sentence matches.

The content key ignores formatting (NFKC, lowercase, letters and digits only, leading list/heading markers removed), so copying through mail and word processors that change quotes, spaces or Markdown does not produce false "altered" results.

## Considered Options

- **No binding:** markers could be transplanted onto arbitrary text. Rejected.
- **Exact text hash:** every target that changes spaces, quotes or line breaks would report "altered". Rejected.
- **Binding the whole response:** a partial copy (one paragraph) could no longer be verified. Rejected.

## Consequences

- Verification has to guess where the sentence starts (candidate sentences). Chance of a random content-tag hit: about 5·10⁻⁶ per signature.
- The normalization also hides some meaningful edits and the candidate search accepts a shortened sentence. The opencode review of 2026-10-31 showed this (`5,00 €` → `500 €`, prefixed "Never"). Tickets [03](../../.scratch/textsiegel/issues/03-content-key-ignores-decimal-and-sign.md) and [04](../../.scratch/textsiegel/issues/04-prefix-edit-passes-content-binding.md) reopen this ADR. A fix changes the content key and therefore needs a new version byte.
