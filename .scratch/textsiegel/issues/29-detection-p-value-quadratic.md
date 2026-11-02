# The exact p-value is quadratic in the number of choice points

- Issue: 29
- Status: open
- Type: implementation
- Labels: performance, security, P2, ready-for-human
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: OCR test-quality review of tickets 01/02/05, 2026-10-31, finding F1
- Created: 2026-10-31

## Problem

`upperTail` in `src/cpmark.ts` computes the Poisson-binomial tail with an O(n²) dynamic program over the distinct choice points. `verify` runs it for every configured key on every public check, although the public result never shows the statistic. Measured by the reviewer with text of the form `"${i} ca. 5 "`: 107 / 220 / 606 / 2,700 ms at 25k / 50k / 100k / 200k characters. With `MAX_TEXT_LENGTH` = 100,000 one check costs about 0.6 s per key.

## Notes

Options, to be decided:

- Skip the statistic in `createVerificationService().verify` for non-experts (the public verdict maps `statistical` to `none` anyway). Cheapest; changes no p-value.
- Bound the work: compute the tail only up to the needed count, or use a normal or saddle-point approximation above some n. Changes p-values for long texts; needs a note in the spec and probably an ADR.
- Lower `MAX_TEXT_LENGTH`.

## Acceptance criteria

- [ ] RED first: a scaling test like `assertLinear` in `test/text.test.ts` with distinct contexts fails today.
- [ ] Public verification at `MAX_TEXT_LENGTH` stays well under 100 ms of statistic work per key.
- [ ] Expert results unchanged, or the change is decided by Daniel and documented.

## Comments
