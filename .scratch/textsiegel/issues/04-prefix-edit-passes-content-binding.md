# A prefixed edit passes the content binding

- Issue: 04
- Status: open
- Type: implementation
- Labels: bug, security, P1, needs-triage
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: [#18](18-decide-content-binding-v2.md)
- Source: opencode review (Alibaba), 2026-10-31, finding 4
- Created: 2026-10-31

## Problem

`sentenceCandidates` (`src/signature.ts:185`) tries every one of the last 80 word starts as a sentence start. `Use this medicine.` edited to `Never use this medicine.` still matches on the suffix and verifies as `signed`, content 1/1. 0xF3 accepts the same.

## Notes

Word-start candidates were added so that foreign text before a sentence does not break verification. The rules must distinguish "text before the sentence" from "the sentence was changed at its start". Options: no word-start candidates, a boundary rule (candidate must start after a sentence end, line start or previous marker), or storing the sentence length. Most options change the format → decide in 18.

## Acceptance criteria

- [ ] Decision in 18 recorded.
- [ ] Tests: prefixed negation and prefixed words report `signed-altered`/`altered`; a marked sentence pasted after foreign text with a sentence end still verifies as unchanged.

## Comments
