# `layers: []` deletes the whole answer text

- Issue: 05
- Status: claimed
- Type: implementation
- Labels: bug, P1, ready-for-agent
- Assignee: Claude (agent), branch fix/p1-tickets-01-02-05
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 5
- Created: 2026-10-31

## Problem

With no active Choice-Point-Mark classes (`layers: []`), `src/cpmark.ts:128` never copies the input. `markText`, `markResponse` and `StreamMarker` return an empty string for `Hallo Welt.` A signature-only setup without the statistical layer therefore loses the whole answer.

## Acceptance criteria

- [ ] RED first: for `layers: []`, all three APIs return the input text unchanged apart from markers, and `verify` reports `signed`.
- [ ] Same for a class filter that matches nothing in the text.

## Comments
