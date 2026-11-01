# Mark after generation, not during sampling

Decision by Daniel (2026-10-30), implemented in the initial commits on `main` (no PR).

Fragbar runs on Mittwald Shared AI Hosting, and customers bring their own API key. The hosted API offers neither `n`, `logprobs` nor `logit_bias`. Sampling-based watermarks (green lists, SynthID-style tournament sampling) are therefore impossible. textsiegel marks the finished text: invisible markers behind sentences plus a statistical choice-point layer, with no extra model call.

## Considered Options

- **Sampling watermark:** strongest against rewording, but needs logit access the platform does not give. Rejected.
- **Second LLM call that rewrites the answer with a key:** doubles cost and latency, changes the answer, unreliable. Rejected.
- **Visible label only:** does not satisfy Art. 50(2) (machine-readable marking) and is lost on copy. Rejected as the only measure; the AI notice of Art. 50(1) stays a separate duty of the deployer.

## Consequences

- Works with every model and with streaming; the stream is released sentence by sentence.
- Nothing survives rewording or retyping except the lexical part of Choice-Point-Mark. This limit is documented in README and on the about page.
