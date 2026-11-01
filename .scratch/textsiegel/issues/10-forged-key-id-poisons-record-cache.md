# A forged key ID poisons the record cache within one verification

- Issue: 10
- Status: open
- Type: implementation
- Labels: bug, security, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 10
- Created: 2026-10-31

## Problem

`src/provenance.ts:140`: a prefixed marker with a real response ID but a wrong key ID makes the following genuine, unchanged text `unverified`. The record cache is keyed by response ID only, so the failed lookup for the wrong key is reused. The same marker placed after the text has no effect.

## Acceptance criteria

- [ ] RED first: forged marker before genuine text → genuine sentences still `verified`.
- [ ] Cache key includes the key ID, or the record is fetched once and checked per marker.

## Comments
