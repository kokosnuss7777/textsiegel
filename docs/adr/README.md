# Architecture decision records

One file per decision: `NNNN-short-title.md`. Each states who decided, when, why and in which PR it was implemented, plus the options considered and the consequences. A superseded ADR stays; the new one links to it.

ADR 0001–0008 were recorded on 2026-10-31 after the fact: the decisions were made in the prototype session of 2026-10-30/31 and implemented in the initial commits on `main`, before the pull-request workflow existed.

| ADR | Decision |
|---|---|
| [0001](0001-mark-after-generation.md) | Mark after generation, not during sampling |
| [0002](0002-carriers-zwnj-zwj-wj.md) | Carriers ZWNJ, ZWJ, Word Joiner in base 3 |
| [0003](0003-bind-signature-to-sentence.md) | Bind every signature to its sentence |
| [0004](0004-hmac-default-public-provenance-optional.md) | HMAC signature by default, public provenance optional |
| [0005](0005-one-mark-key-per-deployment.md) | One mark key per deployment |
| [0006](0006-independent-english-mit.md) | Independent project, English, MIT |
| [0007](0007-pull-deployment-ghcr-tailnet.md) | Pull deployment from GHCR, tailnet only for now |
| [0008](0008-verification-service-code-of-practice.md) | Verification service along the Code of Practice |
| [0009](0009-protected-main-and-supply-chain.md) | Protected `main` and supply-chain hardening |
