# E-mail detection is quadratic and blocks the service

- Issue: 02
- Status: claimed
- Type: implementation
- Labels: bug, security, P1, ready-for-agent
- Assignee: Claude (agent), branch fix/p1-tickets-01-02-05
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 2
- Created: 2026-10-31

## Problem

The e-mail pattern in `src/text.ts:17` backtracks quadratically on long strings without `@`. It runs synchronously in `verify` for every public check (`src/service.ts:164`). 50,000 × `a` took about 2.8 s; a parallel request for the key document waited 2.7 s. The rate limit allows far more than that.

## Acceptance criteria

- [ ] RED first: a test with 50,000 `a` (and variants: long `a.b.c…`, long `a-a-a…`) finishes `blockedRanges` in well under 100 ms.
- [ ] Rewrite the pattern linearly (e.g. anchor on `@` and scan outwards) with the same matches on the existing tests.
- [ ] The service rejects texts above a documented maximum length (`413`) before any processing; the limit is in the spec and on the about page.
- [ ] Check the other patterns in `text.ts` and `signature.ts` for the same issue (URL, code, quote search) and add a timing test for each.

## Comments
