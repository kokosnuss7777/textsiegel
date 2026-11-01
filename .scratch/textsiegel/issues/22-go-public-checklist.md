# Prepare the verification service for public access

- Issue: 22
- Status: open
- Type: task
- Labels: ready-for-human
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: [#01](01-malformed-url-crashes-server.md), [#02](02-email-regex-quadratic-dos.md), [#03](03-content-key-ignores-decimal-and-sign.md), [#04](04-prefix-edit-passes-content-binding.md), [#05](05-empty-layers-drops-text.md), [#07](07-utf8-split-across-chunks.md), [#08](08-rate-limit-behind-proxy.md), [#09](09-forged-f3-overrides-hmac-verdict.md), [#10](10-forged-key-id-poisons-record-cache.md), [#18](18-decide-content-binding-v2.md), [#26](26-back-up-ed25519-key.md)
- Source: Open item from the prototype session
- Created: 2026-10-31

## Scope

Before the service leaves the tailnet ([ADR-0007](../../../docs/adr/0007-pull-deployment-ghcr-tailnet.md)):

- [ ] All P1 tickets (01–05, 18) resolved, as ADR-0007 requires.
- [ ] Security tickets 09 and 10 and service tickets 07 and 08 resolved.
- [ ] `CONTACT` and `EXPERT_TOKENS` set; `TEST_PAGE=0`.
- [ ] Domain or Tailscale Funnel decided; repository variable `SERVICE_URL` updated so the Pages check page works.
- [ ] Ticket 26 (key backup) done.

## Comments
