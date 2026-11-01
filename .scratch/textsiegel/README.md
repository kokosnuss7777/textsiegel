# textsiegel – local ticket tracker

**Authoritative spec:** [docs/specs/textsiegel.md](../../docs/specs/textsiegel.md). **Map:** [map.md](map.md). **How to work with tickets:** [docs/agents/issue-tracker.md](../../docs/agents/issue-tracker.md).

This tracker is part of the public repository. Do not put secrets or private data here. Vulnerabilities that affect a public deployment are reported privately first (see [SECURITY.md](../../SECURITY.md)); the ticket follows once a fix is merged or the risk is accepted.

Tickets 01, 02, 04, 09 and 10 describe security issues found by the opencode review of 2026-10-31. They are tracked publicly because textsiegel has no public deployment yet: the only verification service is reachable in the maintainer's tailnet only, and v0.1.0 has no known users besides Fragbar, which is not live with it.

## Index

| # | Title | Type | Labels | Status | Blocked by |
|---|---|---|---|---|---|
| [01](issues/01-malformed-url-crashes-server.md) | A malformed request path crashes the server | implementation | bug, security, P1, ready-for-agent | claimed | - |
| [02](issues/02-email-regex-quadratic-dos.md) | E-mail detection is quadratic and blocks the service | implementation | bug, security, P1, ready-for-agent | claimed | - |
| [03](issues/03-content-key-ignores-decimal-and-sign.md) | Content key ignores decimal separators and signs | implementation | bug, P1, needs-triage | open | 18 |
| [04](issues/04-prefix-edit-passes-content-binding.md) | A prefixed edit passes the content binding | implementation | bug, security, P1, needs-triage | open | 18 |
| [05](issues/05-empty-layers-drops-text.md) | `layers: []` deletes the whole answer text | implementation | bug, P1, ready-for-agent | claimed | - |
| [06](issues/06-check-page-overstates-unchanged.md) | Check page says "unchanged" for partly changed texts | implementation | bug, P2, ready-for-agent | open | - |
| [07](issues/07-utf8-split-across-chunks.md) | UTF-8 is corrupted at request chunk boundaries | implementation | bug, P2, ready-for-agent | open | - |
| [08](issues/08-rate-limit-behind-proxy.md) | Rate limit is shared by all clients behind a reverse proxy | implementation | bug, P2, ready-for-agent | open | - |
| [09](issues/09-forged-f3-overrides-hmac-verdict.md) | A forged 0xF3 marker overrides a valid HMAC verdict | implementation | bug, security, P2, ready-for-agent | open | - |
| [10](issues/10-forged-key-id-poisons-record-cache.md) | A forged key ID poisons the record cache within one verification | implementation | bug, security, P2, ready-for-agent | open | - |
| [11](issues/11-rendered-links-break-content-binding.md) | Copying rendered links or HTML reports a false "altered" | implementation | bug, P2, needs-triage | open | 18 |
| [12](issues/12-tilde-and-indented-code-unprotected.md) | Tilde fences and indented code are not protected | implementation | bug, P2, ready-for-agent | open | - |
| [13](issues/13-long-quotes-get-rewritten.md) | Long or multi-paragraph quotes are changed | implementation | bug, P2, ready-for-agent | open | - |
| [14](issues/14-spaced-thematic-break-rewritten.md) | Spaced Markdown thematic breaks are rewritten | implementation | bug, P2, ready-for-agent | open | - |
| [15](issues/15-short-setext-underline-broken.md) | Short setext underlines are broken by a marker | implementation | bug, P2, ready-for-agent | open | - |
| [16](issues/16-atx-closing-hashes-visible.md) | Optional ATX closing hashes become visible | implementation | bug, P2, ready-for-agent | open | - |
| [17](issues/17-long-autolink-gets-marker.md) | Long autolinks get markers inside the link target | implementation | bug, P2, ready-for-agent | open | - |
| [18](issues/18-decide-content-binding-v2.md) | Decide the content binding for the next format version | grilling | P1, ready-for-human | open | - |
| [19](issues/19-retired-keys-stay-verifiable.md) | Keep retired keys verifiable after rotation | implementation | P2, ready-for-agent | open | - |
| [20](issues/20-record-write-endpoint.md) | Authenticated write endpoint for provenance records | implementation | P2, needs-triage | open | 21 |
| [21](issues/21-record-retention.md) | Decide the retention period for provenance records | grilling | needs-info, ready-for-human | open | - |
| [22](issues/22-go-public-checklist.md) | Prepare the verification service for public access | task | ready-for-human | open | 01–05, 07–10, 18, 26 |
| [23](issues/23-marking-for-non-node-backends.md) | Marking for non-Node backends (port or sidecar) | research | needs-info | open | - |
| [24](issues/24-hand-test-current-markers.md) | Hand-test the 101/81-carrier markers in mail and office apps | task | ready-for-human | open | - |
| [25](issues/25-check-page-per-sentence-result.md) | Show the result per sentence on the check page | implementation | P3, needs-triage | open | - |
| [26](issues/26-back-up-ed25519-key.md) | Back up the Ed25519 key of the deployment | task | ready-for-human | open | - |
| [27](issues/27-wcag-audit-check-page.md) | WCAG audit of check and about page | task | P3, needs-triage | open | - |
| [28](issues/28-interoperability-review-2027.md) | Review interoperability before 2 Feb 2027 | research | needs-triage | open | - |
| [30](issues/30-test-page-html-injection.md) | The test page inserts labels and stored log fields as HTML | implementation | bug, security, P2 | resolved | - |
