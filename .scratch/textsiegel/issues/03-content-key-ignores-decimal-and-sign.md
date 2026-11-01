# Content key ignores decimal separators and signs

- Issue: 03
- Status: open
- Type: implementation
- Labels: bug, P1, needs-triage
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: [#18](18-decide-content-binding-v2.md)
- Source: opencode review (Alibaba), 2026-10-31, finding 3
- Created: 2026-10-31

## Problem

`contentKey` keeps only letters and digits (`src/signature.ts:41`). `5,00 €` → `500 €` and `-100 Euro` → `100 Euro` still verify as `signed` with a full content match, also for 0xF3. This matches the documented normalization but contradicts the claim "unchanged".

## Notes

Changing the content key changes the meaning of the content tag and the sentence hash, so it needs a new version byte, new test vectors and an ADR superseding part of [ADR-0003](../../../docs/adr/0003-bind-signature-to-sentence.md). Decide together with 04 and 11 in ticket 18.

## Acceptance criteria

- [ ] Decision in 18 recorded.
- [ ] Tests: changed decimal separators, signs, percent and currency amounts report the sentence as altered; quote, space and dash changes still do not.
- [ ] Old version keeps verifying with its old rules.

## Comments
