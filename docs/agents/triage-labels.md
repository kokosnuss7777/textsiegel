# Triage labels

Tickets carry triage roles in their `Labels:` line. `Status:` tracks the lifecycle separately (`open`, `claimed`, `resolved`, `closed`); a readiness label never overrides a terminal status. See [issue tracker](issue-tracker.md).

| Label | Meaning |
|---|---|
| `needs-triage` | Maintainer needs to evaluate this ticket |
| `needs-info` | Waiting for information or a decision outside the repo |
| `ready-for-agent` | Fully specified, an agent can implement it |
| `ready-for-human` | Needs Daniel (decision, hand test, access to the VPS or accounts) |
| `wontfix` | Will not be actioned |

Additional labels: `bug`, `security`, and priority `P1` (fix before production use), `P2`, `P3`; Wayfinder labels such as `wayfinder:map`.
