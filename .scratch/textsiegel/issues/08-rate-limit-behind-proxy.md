# Rate limit is shared by all clients behind a reverse proxy

- Issue: 08
- Status: open
- Type: implementation
- Labels: bug, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 8
- Created: 2026-10-31

## Problem

`server/server.ts:334` uses the socket address only. Behind a reverse proxy (or `tailscale serve`) all clients share one limit: client A gets 200, then client B gets 429.

## Acceptance criteria

- [ ] Opt-in `TRUST_PROXY` (off by default): when on, the client address comes from `X-Forwarded-For` (rightmost untrusted hop) or `Forwarded`.
- [ ] Tests for off (header ignored, no spoofing) and on (two forwarded clients have separate limits).
- [ ] Documented in the env example and the README.

## Comments
