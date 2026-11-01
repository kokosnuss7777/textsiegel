# Long autolinks get markers inside the link target

- Issue: 17
- Status: open
- Type: implementation
- Labels: bug, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 17
- Created: 2026-10-31

## Problem

`src/signature.ts:134`: the URL check looks at the last 300 characters only. For a longer URL ending in a period, the marker went URL-encoded into the `href` in the real renderer.

## Acceptance criteria

- [ ] RED first: URLs of 300, 301 and 2,000 characters at a sentence end get no marker in `href` (render test).
- [ ] Linear-time check (see ticket 02).

## Comments
