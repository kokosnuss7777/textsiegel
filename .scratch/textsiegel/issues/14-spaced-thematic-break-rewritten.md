# Spaced Markdown thematic breaks are rewritten

- Issue: 14
- Status: open
- Type: implementation
- Labels: bug, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 14
- Created: 2026-10-31

## Problem

`src/classes.ts:137`: with key `k0`, `- - -` becomes `- – -`; the renderer no longer draws a horizontal rule.

## Acceptance criteria

- [ ] RED first: `- - -`, `* * *`, `_ _ _` and variants with more characters/spaces stay unchanged for many keys.
- [ ] Shared helper for "Markdown structure line" used by classes and signature placement.

## Comments
