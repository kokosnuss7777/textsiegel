# Carriers ZWNJ, ZWJ, Word Joiner in base 3

Decision by Daniel (2026-10-30, after the character, run and carrier tests on the test page), implemented in the initial commits on `main` (no PR).

Markers are runs of ZWNJ (U+200C) = 0, ZWJ (U+200D) = 1 and Word Joiner (U+2060) = 2, base 3, directly behind a sentence or line end. Measured by hand: invisible in Word for Mac, Word Online, Google Docs, Gmail, Outlook Web, WhatsApp Web and TextEdit; the runs survive Gmail and Outlook Web singly, as runs and mixed.

## Considered Options

- **Variation selectors (VS1–VS256), the usual choice:** Word for Mac shows them as boxes, Outlook Web removes VS17–VS256, Gmail removes runs of 8 or more. Rejected.
- **ZWSP / CGJ:** Gmail removes runs of them. Rejected.
- **Unicode tag characters:** outside the BMP, stripped by several targets and by utf8mb3 databases. Rejected.
- **Groups of 4 / binary with two carriers:** longer runs for the same payload. Base 3 with three carriers gives 101 characters for 20 bytes.

## Consequences

- Programs that strip all zero-width characters remove every marker; that is a documented limit.
- Runs shorter than 8 carriers are left alone, so single ZWJ in emoji and ZWNJ in running text stay untouched.
- Any carrier change needs new hand measurements in Gmail, Outlook Web and Word, plus a new version byte.
