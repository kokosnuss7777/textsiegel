# Keep retired keys verifiable after rotation

- Issue: 19
- Status: open
- Type: implementation
- Labels: P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: cubic review of PR #1, 2026-10-31
- Created: 2026-10-31

## Problem

The server publishes and accepts one Ed25519 key and one `MARK_KEY`. After a rotation, older texts cannot be verified any more. SECURITY.md documents this limit (PR #1).

## Acceptance criteria

- [ ] Config for retired Ed25519 public keys (with `validTo`) and retired mark keys (verification only, never used to mark).
- [ ] Key document lists retired keys; `verify` and `verifyPublic` accept them.
- [ ] Tests: text marked before rotation still verifies; new texts use the new key; SECURITY.md describes the rotation procedure.

## Comments
