# Optional ATX closing hashes become visible

- Issue: 16
- Status: open
- Type: implementation
- Labels: bug, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 16
- Created: 2026-10-31

## Problem

`src/signature.ts:113`: for `## Title ##`, the appended marker prevents recognition of the closing hashes; the heading shows `Title ##`.

## Acceptance criteria

- [ ] RED first: `## Title ##` renders as `Title` after marking; the marker goes before the closing sequence or is omitted.

## Comments
