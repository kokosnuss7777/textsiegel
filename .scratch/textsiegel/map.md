# Wayfinder: textsiegel ready for production use

- Issue: 00
- Status: open
- Type: map
- Labels: wayfinder:map
- Assignee: -
- Parent: -
- Blocked by: -
- Children: [#01](issues/01-malformed-url-crashes-server.md), [#02](issues/02-email-regex-quadratic-dos.md), [#03](issues/03-content-key-ignores-decimal-and-sign.md), [#04](issues/04-prefix-edit-passes-content-binding.md), [#05](issues/05-empty-layers-drops-text.md), [#06](issues/06-check-page-overstates-unchanged.md), [#07](issues/07-utf8-split-across-chunks.md), [#08](issues/08-rate-limit-behind-proxy.md), [#09](issues/09-forged-f3-overrides-hmac-verdict.md), [#10](issues/10-forged-key-id-poisons-record-cache.md), [#11](issues/11-rendered-links-break-content-binding.md), [#12](issues/12-tilde-and-indented-code-unprotected.md), [#13](issues/13-long-quotes-get-rewritten.md), [#14](issues/14-spaced-thematic-break-rewritten.md), [#15](issues/15-short-setext-underline-broken.md), [#16](issues/16-atx-closing-hashes-visible.md), [#17](issues/17-long-autolink-gets-marker.md), [#18](issues/18-decide-content-binding-v2.md), [#19](issues/19-retired-keys-stay-verifiable.md), [#20](issues/20-record-write-endpoint.md), [#21](issues/21-record-retention.md), [#22](issues/22-go-public-checklist.md), [#23](issues/23-marking-for-non-node-backends.md), [#24](issues/24-hand-test-current-markers.md), [#25](issues/25-check-page-per-sentence-result.md), [#26](issues/26-back-up-ed25519-key.md), [#27](issues/27-wcag-audit-check-page.md), [#28](issues/28-interoperability-review-2027.md), [#29](issues/29-detection-p-value-quadratic.md), [#30](issues/30-test-page-html-injection.md)

## Destination

textsiegel can be used by Fragbar and other chatbot providers in production, and its verification service can be public: no known way to crash or stall it, verdicts that do not overstate "unchanged", Markdown output that renders the same with and without markers, and documented key rotation.

## Notes

- The prototype was built in one session (2026-10-30/31) without tickets, spec or ADRs; this tracker, the spec and ADR 0001–0009 were added afterwards.
- Tickets 01–17 are the reproduced findings of the opencode review of 2026-10-31 (P1 = fix before production use). Ticket 19 comes from the cubic review of PR #1.
- 01 and 02 are denial-of-service issues of the verification service. The deployed service is tailnet-only, which limits exposure; fix them first.

## Decisions so far

- [ADR-0001](../../docs/adr/0001-mark-after-generation.md) – mark after generation
- [ADR-0002](../../docs/adr/0002-carriers-zwnj-zwj-wj.md) – carriers ZWNJ/ZWJ/WJ
- [ADR-0003](../../docs/adr/0003-bind-signature-to-sentence.md) – content binding (reopened by 18)
- [ADR-0004](../../docs/adr/0004-hmac-default-public-provenance-optional.md) – HMAC default, provenance optional
- [ADR-0005](../../docs/adr/0005-one-mark-key-per-deployment.md) – one mark key per deployment
- [ADR-0006](../../docs/adr/0006-independent-english-mit.md) – independent, English, MIT
- [ADR-0007](../../docs/adr/0007-pull-deployment-ghcr-tailnet.md) – pull deployment, tailnet only
- [ADR-0008](../../docs/adr/0008-verification-service-code-of-practice.md) – Code of Practice measures
- [ADR-0009](../../docs/adr/0009-protected-main-and-supply-chain.md) – protected main

## Not yet specified

- Content binding of the next format version (18).
- Record retention (21) and write path (20).
- Backend language of Fragbar (23).

## Out of scope

- Robustness against rewording by an LLM (see README → Limits).
- Choice-Point-Mark classes for languages other than German.
