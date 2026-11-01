# The test page inserts labels and stored log fields as HTML

- Issue: 30
- Status: resolved
- Type: implementation
- Labels: bug, security, P2
- Assignee: Claude
- Parent: [map](../map.md)
- Blocked by: -
- Source: CodeQL alert 4 (`js/xss-through-dom`), reported on PR #2, 2026-11-01
- Created: 2026-11-01

## Problem

`server/test-page.html` builds the result cards and the test matrix with `innerHTML`. The card label (for counter-checks the probe button's `textContent`) and the matrix fields read back from `localStorage` (`version`, `verdict`, `sig`, `markerChars`, `nbsp`, `unchangedCopy`, `time`) are inserted without escaping. Markup in any of them is parsed as HTML. The test page is off in public operation (`TEST_PAGE=0`), so this is defence in depth, but it is a required CodeQL check.

Spec: [§10 Verification service](../../../docs/specs/textsiegel.md#10-verification-service) (test page).

## Non-goals

- The check page and about page (no CodeQL finding there).
- Replacing `innerHTML` templates with DOM construction.

## Acceptance criteria

- [x] RED first: a browser test puts markup into a probe label and into a stored matrix entry; no element is created from it and the text is shown literally.
- [x] Every dynamic value in the result cards and the matrix goes through `esc`.
- [x] CodeQL reports no open `js/xss-through-dom` alert for `server/test-page.html`.

## Comments

2026-11-01 – Resolved in PR #2 (chore/dev-standards):

- RED: `npx playwright test --project=chromium -g "ticket 30"` failed before the fix. The matrix column `version` rendered the stored `<img>` instead of its text (`Received: ""`).
- Fix: `esc` accepts any value (`String(s ?? "")`); the card label, verdict and response note and every matrix field go through `esc`.
- GREEN: `npx playwright test` – 33 passed (Chromium, Firefox, WebKit); `npm test` 85/85; `npm run lint` 0 errors.
- Counter-probe: with only the label escape removed, the test fails (`Received: "counter-check: "`).
- CodeQL: the alert is re-evaluated on the PR run; the last criterion is checked once that run is green.
