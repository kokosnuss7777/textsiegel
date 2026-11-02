# UTF-8 is corrupted at request chunk boundaries

- Issue: 07
- Status: open
- Type: implementation
- Labels: bug, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 7
- Created: 2026-10-31

## Problem

`server/server.ts:295` decodes every body chunk separately. An `ä` split across two writes gives a different text (and report hash) than the same request in one piece.

## Acceptance criteria

- [ ] RED first: a raw HTTP test splits a multibyte character across two writes; report hash and verdict equal the unsplit request.
- [ ] Collect `Buffer`s and decode once (or use `TextDecoder` with `stream: true`); enforce a byte cap on the raw chunks before buffering them (today `readBody` only checks 1,000,000 decoded characters, which does not bound the bytes held in memory), and keep the decoded text limit after decoding.

## Comments
