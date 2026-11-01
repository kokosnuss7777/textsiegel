# OCR behavioral test-quality review

Use this procedure after changing behaviour or its tests, before declaring the work complete. The rule definitions are in [`.opencodereview/rule.json`](../../.opencodereview/rule.json): TQ-01 through TQ-08 supplement OCR's language rules. They are a test-quality review, not a replacement for running the tests or for reviewing correctness and security.

## Local prerequisites

Use the installed `ocr` CLI (open-code-review) in delegation mode: it selects files and resolves rules locally; an independent reviewer agent does the reasoning through the existing model connection. This procedure configures no OCR provider and publishes nothing on GitHub.

Exercised with OCR 1.13.3. OCR documents Git ≥ 2.41; the maintainer's Mac has Apple Git 2.39.5, so OCR prints a compatibility warning. Record that limitation; do not silently upgrade global tooling.

Profile checks (part of `npm test`; the two CLI checks are skipped when `ocr` is not installed, e.g. in CI – a skip is not a successful verification):

```sh
node --test test/ocr-rules.test.ts
```

## Review a fixed implementation

1. **Freeze the input.** Finish the TDD step. Record the baseline, the committed review HEAD and the worktree status. A range review excludes uncommitted work.
2. **Select files.**

   ```bash
   ocr delegate preview --from "$BASE" --to "$REVIEW_HEAD" \
     --rule .opencodereview/rule.json --format json
   ```

   Inspect selected and excluded paths. The profile includes the Node tests (`test/`) and the browser tests (`e2e/tests/`), which OCR drops by default. A missing expected test, a `too_large` exclusion or an unexplained relevant exclusion makes the review incomplete. The tracker (`.scratch/`), generated output and dependencies stay excluded.
3. **Resolve the rules** for every selected path:

   ```bash
   ocr delegate rule --from "$BASE" --to "$REVIEW_HEAD" --rule .opencodereview/rule.json --format json <selected-paths...>
   ```

   `<selected-paths...>` is a placeholder. Do not pass the full spec via `--background-file` (OCR rejects more than 8,000 characters); give the spec directly to the reviewer in step 4. Confirm TQ-01 to TQ-08 resolve for tests and production code. Export plain diffs with `--no-ext-diff --no-textconv --no-color` plus full-file context.
4. **Delegate read-only.** A reviewer independent of the implementer gets the preview, the resolved rules, the fixed diff and files, [the spec](../specs/textsiegel.md), `spec/test-vectors.json`, the accepted ticket and the execution/TDD evidence. It reads adjacent existing tests before reporting a gap and modifies nothing.
5. **Triage and repair.** Validate findings against the spec. A verified defect or high-risk gap gets a focused regression test and the normal RED/GREEN loop; a false positive gets a documented reason. Re-review the fix on its new refs. Nothing is merged or published automatically.

## Required report and completion gate

Summarize the report in the ticket under `## Comments`:

- Baseline, review HEAD and any dirty or omitted input.
- Every selected path as reviewed or skipped with reason; selected/reviewed/skipped counts (file-review completeness, not coverage).
- A risk matrix: requirement or risk → equivalence classes/boundaries/decision or state cases → concrete test names with their decisive assertion. TQ-01..08 each as checked, not applicable (with reason) or unverified. An unverified critical item is not an approval.
- Findings with TQ ID, severity, file/line, contract, counterexample, expected versus actual, and a test suggestion.
- Exact commands and actual results for every execution claim.
- Disposition of every finding and remaining risk.

Exit code zero, partial output or a count of passing tests do not satisfy the gate.

## Targeted sensitivity checks

For critical rules, try a plausible wrong implementation on an isolated copy (a worktree): e.g. accept every word start as sentence start, drop the HMAC check, log the request body. Run the covering test and record patch, command and observed failure. If the test stays green, investigate before concluding it is weak. Report only counterprobes actually executed.

## References

- [OCR review rules](https://open-codereview.ai/docs/review-rules)
- [OCR delegation workflow](https://open-codereview.ai/docs/delegate)
