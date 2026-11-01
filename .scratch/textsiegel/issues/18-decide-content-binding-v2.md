# Decide the content binding for the next format version

- Issue: 18
- Status: open
- Type: grilling
- Labels: P1, ready-for-human
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: Derived from opencode review findings 3, 4, 11
- Created: 2026-10-31

## Question

Tickets 03, 04 and 11 show that the content binding of 0xF2/0xF3 is both too lax (decimal separators, signs, prefixed words) and too strict (link targets, HTML). Fixing them changes the content key and the candidate rules, so it needs a new version byte. Decide together:

1. What the content key keeps: digits with separators and signs? Visible text only (no link targets, no tags)?
2. Which sentence starts the verifier may try, and whether the marker should carry the sentence length (costs carriers).
3. Whether 0xF2 and 0xF3 move together (0xF4/0xF5) and how long old versions stay verifiable.
4. Wording on check page and README until then ("content matches" instead of "unchanged"?).

## Outcome

An ADR superseding the content-key part of ADR-0003, a spec update, and 03/04/11 set to `ready-for-agent`.

## Comments
