# Protected `main` and supply-chain hardening

Decision by Daniel (2026-10-31: "bitte sichere das Repo ab, dass nur PRs nach main kommen … Best Practices"), implemented in PR #1 and in the repository settings.

- Ruleset "main: pull requests only": no deletion or force push, linear history, signed commits, pull request required (squash only, stale reviews dismissed, threads resolved), required checks `test` and `browser` (strict), CodeQL (high or higher). No bypass actors.
- Ruleset "release tags are immutable" for `refs/tags/v*`.
- Secret scanning with push protection, Dependabot alerts and security updates, private vulnerability reporting, CodeQL default setup.
- Actions pinned to commit SHAs, workflow token read-only by default, `persist-credentials: false`, build provenance attestation and SBOM for the container image.

## Considered Options

- **Required approvals (1+):** Daniel is the only maintainer and cannot approve his own PRs. 0 approvals required; review comes from cubic and opencode review. Required code-owner review rejected for the same reason.
- **Bypass for the owner:** would allow direct pushes to `main` again. Rejected.

## Consequences

- Every change, including docs, goes through a PR with green checks.
- Squash merges are signed by GitHub, so contributors' unsigned commits on branches are acceptable.
