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

Fix by computing the content key over the visible text (strip Markdown link targets, autolink brackets, HTML tags). This changes the content key → decide in 18.

## Acceptance criteria

- [ ] Decision in 18 recorded.
- [ ] Tests: Markdown link, autolink, inline HTML and image alt text, each copied as rendered text, verify as unchanged.

## Comments
