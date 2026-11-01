# Short setext underlines are broken by a marker

- Issue: 15
- Status: open
- Type: implementation
- Labels: bug, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 15
- Created: 2026-10-31

## Problem

`src/signature.ts:110`: for `Title` followed by `==`, a marker lands after the underline and the heading becomes a paragraph.

## Acceptance criteria

- [ ] RED first: setext underlines of any length (`=` and `-`) get no marker; the heading still renders as a heading.

## Comments
