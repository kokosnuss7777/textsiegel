# Prepare the verification service for public access

- Issue: 22
- Status: open
- Type: task
- Labels: ready-for-human
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: [#01](01-malformed-url-crashes-server.md), [#02](02-email-regex-quadratic-dos.md), [#07](07-utf8-split-across-chunks.md), [#08](08-rate-limit-behind-proxy.md), [#26](26-back-up-ed25519-key.md)
- Source: Open item from the prototype session
- Created: 2026-10-31

## Scope

Before the service leaves the tailnet ([ADR-0007](../../../docs/adr/0007-pull-deployment-ghcr-tailnet.md)):

- [ ] Tickets 01, 02, 07 and 08 resolved.
- [ ] `CONTACT` and `EXPERT_TOKENS` set; `TEST_PAGE=0`.
- [ ] Domain or Tailscale Funnel decided; repository variable `SERVICE_URL` updated so the Pages check page works.
- [ ] Ticket 26 (key backup) done.

## Comments
