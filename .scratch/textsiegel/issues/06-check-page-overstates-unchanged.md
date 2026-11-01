# Check page says "unchanged" for partly changed texts

- Issue: 06
- Status: open
- Type: implementation
- Labels: bug, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 6
- Created: 2026-10-31

## Problem

`server/check.html:70` shows "Origin confirmed, unchanged" although only 15 of 16 confirmed sentences were unchanged.

## Acceptance criteria

- [ ] The headline says "unchanged" only if every sentence with origin is unchanged; otherwise it names the count ("15 of 16 sentences unchanged").
- [ ] Browser test for the partial case; the wording is in the spec.

## Comments
