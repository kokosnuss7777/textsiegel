# Copying rendered links or HTML reports a false "altered"

- Issue: 11
- Status: open
- Type: implementation
- Labels: bug, P2, needs-triage
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: [#18](18-decide-content-binding-v2.md)
- Source: opencode review (Alibaba), 2026-10-31, finding 11
- Created: 2026-10-31

## Problem

Link targets and HTML tag names are part of the content key (`src/signature.ts:41`) but disappear when the rendered answer is copied. `[Details](https://example.com).` copied as `Details.` gives `signed-altered`.

## Notes

One option is to compute the content key over the visible text (strip Markdown link targets, autolink brackets, HTML tags). Trade-off: a changed link target inside a signed sentence would then still verify as `signed`, so the binding no longer covers URLs. Whether that is acceptable, or whether targets get their own binding, is decided in 18; this ticket does not pick the fix. Any change to the content key needs a new version byte.

## Acceptance criteria

- [ ] Decision in 18 recorded.
- [ ] Tests: Markdown link, autolink, inline HTML and image alt text, each copied as rendered text, verify as unchanged.

## Comments
