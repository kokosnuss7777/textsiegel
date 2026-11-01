# Long or multi-paragraph quotes are changed

- Issue: 13
- Status: open
- Type: implementation
- Labels: bug, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 13
- Created: 2026-10-31

## Problem

`src/text.ts:49`: the quote search stops after about 400 characters or at a blank line. In both cases `zudem` inside the quote became `außerdem`.

## Acceptance criteria

- [ ] RED first: quotes over 400 characters and quotes spanning paragraphs stay unchanged.
- [ ] Unclosed quotes keep a bounded search (no quadratic cost, see ticket 02).

## Comments
