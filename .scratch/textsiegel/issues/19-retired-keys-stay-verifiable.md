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
- [ ] 0xF3: the marker carries the key ID, so the record's key is selected directly.
- [ ] 0xF2: the marker carries no key ID. Verification tries the current and each retired mark key per run (cost and the Choice-Point-Mark Bonferroni factor grow with the number of keys); a key ID in the HMAC marker is a format change and belongs to ticket 18.
- [ ] Tests: text marked before rotation still verifies; new texts use the new key; SECURITY.md describes the rotation procedure.

## Comments
