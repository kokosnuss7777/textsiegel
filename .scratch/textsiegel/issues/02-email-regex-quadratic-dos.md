# E-mail detection is quadratic and blocks the service

- Issue: 02
- Status: resolved
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

- [x] RED first: a test with 50,000 `a` (and variants: long `a.b.c…`, long `a-a-a…`) finishes `blockedRanges` in well under 100 ms.
- [x] Rewrite the pattern linearly (e.g. anchor on `@` and scan outwards) with the same matches on the existing tests.
- [x] The service rejects texts above a documented maximum length (`413`) before any processing; the limit is in the spec and on the about page.
- [x] Check the other patterns in `text.ts` and `signature.ts` for the same issue (URL, code, quote search) and add a timing test for each.

## Comments

### Resolution (2026-10-31)

Branch `fix/p1-tickets-01-02-05`, one PR for tickets 01, 02 and 05.

- 01: `server/server.ts` parses the request target inside the handler's `try`; `HttpError` carries 400/413 with a fixed message; any other error gives 500 `Internal error.` and logs only error name and code.
- 02: `src/text.ts` finds e-mail addresses (anchored on `@`), Markdown links and HTML tags with linear scanners that return the same ranges as the previous regexes; `rangeChecker` replaces the linear `overlaps`; `findQuotePairs` looks up the next closer and paragraph break in precomputed tables; `processSegment` keeps the text as one string and recomputes blocked ranges only after a change. `MAX_TEXT_LENGTH` = 100,000 characters (spec §10, about page); longer texts and bodies over 1,000,000 characters get 413.
- 05: falls out of the `processSegment` rewrite: the text starts as `prefix + seg`, so no active classes means no change.
- `signature.ts`: the table-row pattern `/\s*\|\s*$/` took 5.5 s on a 100,000-space line during marking; replaced by `trimEnd` with the same position (0 mismatches on 200,000 random lines). Covered by "signature placement: linear on long lines". The URL look-back is bounded to 300 characters; the thematic-break pattern is linear.
- Additional finding during the fix: `verify` on 50,000 characters dense with choice points took 5–11 s (choice-point loop quadratic). Fixed here. The remaining quadratic p-value computation is ticket 29.

### Test-quality review (OCR delegation)

- Baseline `eb10e92`, review HEAD `fcf087a`, clean worktree. OCR 1.13.3 with Apple Git 2.39.5 (compatibility warning, as documented).
- `ocr delegate preview --from eb10e92 --to fcf087a --rule .opencodereview/rule.json --format json`: 10 selected (package.json, server/about.html, server/server.ts, src/cpmark.ts, src/service.ts, src/signature.ts, src/text.ts, test/server.test.ts, test/signature.test.ts, test/text.test.ts), 5 excluded (tracker and spec; the spec was given to the reviewer directly). `ocr delegate rule …` resolved TQ-01..08 for all three groups.
- Independent read-only reviewer agent: 10/10 selected paths reviewed, 0 skipped. TQ-03 not applicable (verdict logic unchanged); all others checked.

Findings and disposition:

| ID | TQ | Severity | Finding | Disposition |
|---|---|---|---|---|
| F1 | 07/02 | medium | Absolute 100 ms / 1 s thresholds flaky under load (2/12 failures) and do not prove linearity | Replaced by `assertLinear`: 4× input ≤ 10× time, fastest of 5 runs, absolute floors 100 ms / 1 s. 0 failures in 48 runs at 24 parallel processes on 12 cores. Distinct-context quadratic p-value → ticket 29 |
| F2 | 01 | high | `rangeChecker` untested; removing the merge step rewrote `ca.` inside a code block | Added "rangeChecker: same answers as a linear overlap test…" (table against the naive test) and "choice points inside a code block that contains inline code stay unchanged". The table test exposed a real difference: touching ranges were merged, so an empty query at the boundary answered `true`; fixed (merge only overlapping ranges) |
| F3 | 01 | medium | Link/tag scanner equivalence only in an out-of-repo script | Added "scanners: same ranges as the previous regexes on adversarial and random input": 36 adversarial strings plus 5,000 seeded random strings, exact sorted comparison with the old regexes |
| F4 | 02 | low | Quote window boundary unpinned | Added "quotation pairs: closer within 399 characters pairs, at 400 or after a paragraph break it does not" |
| F5 | 02 | low | Body boundary and `/api/check` 400s untested | Body of exactly 1,000,000 → 200, 1,000,001 → 413; seven malformed bodies on both endpoints → 400 |
| F6 | 04 | low | Server tests could hang and leak the child | 20 s test timeout, 10 s start and socket timeouts, child killed when start fails |
| F7 | 01 | low | Ticket 05 "class filter" read only as "every class disabled" | Added the other reading: all classes active, text without choice points |
| F8 | spec | medium | Spec overclaimed linearity for marking | Spec §10 now scopes linearity to verification and names marking as worst-case quadratic and ticket 29 |

Counter-probes (plausible wrong implementations on copies, `node --test test/text.test.ts test/signature.test.ts test/cpmark.test.ts`), each run by the reviewer (not caught) and again after the new tests:

| Probe | Patch | After new tests |
|---|---|---|
| P1 | `htmlTags` restarts at an inner `<` | caught by "scanners: same ranges…" |
| P2 | `emailAddresses` local part not bounded by the previous match | caught by "scanners: same ranges…" (`a@b.dex@y.de`) |
| P3 | `rangeChecker` without merge | caught by "rangeChecker…" and "choice points inside a code block…" |
| P4 | `markdownLinks` resumes inside a match | caught by "scanners: same ranges…" |
| P5 | quote window 401 | caught by "quotation pairs…" |
| P6 | previous implementation (`eb10e92`) of text.ts, cpmark.ts, signature.ts | both scaling tests fail (`letters: 351.7 ms for 25000, 5519.9 ms for 100000`) |

Execution evidence (final head):

- `npm run lint`: 0 errors, 8 warnings, 2 infos (pre-existing).
- `npm test`: 98 tests, 98 pass, 0 skipped (OCR CLI present).
- `npm run build`: ok. `npm run test:browser`: 30 passed (Chromium, Firefox, WebKit).
- `spec/test-vectors.json` unchanged; differential old vs new (`markText`, `detect`, `protectedRanges`, `findQuotePairs`, `StreamMarker`, `markResponse`) over 6,010 texts × 2 keys: 0 differences.

Remaining risks: quadratic exact p-value (ticket 29, about 0.6 s per key at the length limit); streaming marking is O(n · segments) (pre-existing, own output only); `readBody` counts decoded characters, not bytes (ticket 07).
