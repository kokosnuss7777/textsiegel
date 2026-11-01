# Tilde fences and indented code are not protected

- Issue: 12
- Status: open
- Type: implementation
- Labels: bug, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 12
- Created: 2026-10-31

## Problem

`src/text.ts:13`: only backtick fences are protected. Inside a `~~~` block, words were rewritten and markers landed in the code and after the closing fence, so the renderer no longer closed the block. Indented code blocks are not protected either.

## Acceptance criteria

- [ ] RED first: `~~~` fences (also with info string and longer fences) and 4-space indented code are left byte-for-byte unchanged, with no marker inside or directly after the closing fence.
- [ ] Render test with `marked`: same HTML structure before and after marking.

## Comments
