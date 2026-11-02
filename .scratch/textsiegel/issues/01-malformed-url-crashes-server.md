# A malformed request path crashes the server

- Issue: 01
- Status: resolved
- Type: implementation
- Labels: bug, security, P1, ready-for-agent
- Assignee: Claude (agent), branch fix/p1-tickets-01-02-05
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 1
- Created: 2026-10-31

## Problem

`server/server.ts` (around line 304) calls `new URL(...)` outside the `try` block. A request path such as `//[` throws, the error is unhandled and the Node process exits with code 1. One request takes the service down until the container restarts.

Spec: [§10 Verification service](../../../docs/specs/textsiegel.md#10-verification-service).

## Non-goals

- Request validation beyond the request target (body limits are ticket 02, chunk decoding ticket 07).

## Acceptance criteria

- [x] RED first: a server test sends `GET //[` (raw HTTP, not via `fetch`, which normalizes) and then a valid request; the second request is answered.
- [x] Malformed request targets get `400` and the process keeps running.
- [x] Any other unexpected error in a handler returns `500` without the error text and without logging submitted text.

## Comments

### Resolution and test-quality review (2026-10-31)

Fixed on branch `fix/p1-tickets-01-02-05` together with tickets 01, 02 and 05 (one PR). Review report for all three is in ticket 02.
