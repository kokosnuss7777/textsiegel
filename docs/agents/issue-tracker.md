# Issue tracker: local Markdown

Tickets and the Wayfinder map live in the repository under [`.scratch/textsiegel/`](../../.scratch/textsiegel/README.md). The authoritative behaviour is [docs/specs/textsiegel.md](../specs/textsiegel.md); tickets reference it instead of restating it. GitHub is used for pull requests, reviews and CI only – no GitHub issues.

The repository is public, and so is the tracker: no secrets, no private data, and no undisclosed vulnerabilities affecting a public deployment (see [SECURITY.md](../../SECURITY.md)).

## Ticket files

- One effort per directory: `.scratch/<effort>/`. The current effort is `textsiegel`.
- The map is `map.md` (issue 00); tickets are `issues/NN-<slug>.md`. New tickets take the next unused number; never reuse a number.
- Header fields: `Issue`, `Status`, `Type` (`implementation`, `research`, `grilling`, `task`, `map`), `Labels`, `Assignee`, `Parent`, `Blocked by`, `Source`, `Created`.
- `Status:` is the lifecycle: `open`, `claimed`, `resolved` or `closed`. `resolved` means done; `closed` means not planned or superseded. Both are terminal.
- `Labels:` carries triage roles and priorities, see [triage labels](triage-labels.md).
- Discussion goes under `## Comments` (dated); a decision under `## Answer`. Add dated corrections rather than rewriting history.

## Lifecycle

- **Claim:** re-read the ticket and its blockers, set `Status: claimed` and `Assignee`. A Markdown file is not a lock: one coordinator assigns work; parallel implementers use separate worktrees.
- **Work:** branch, TDD, PR. The PR description links the ticket file.
- **Resolve:** append the outcome with evidence (PR link, commands and results), set `Status: resolved`, update the index row in `README.md` and add a line to "Decisions so far" in `map.md` if a decision was made.
- **Rule out:** explain why, set `Status: closed`, list it under "Out of scope" in the map.

## Wayfinding

- **Map:** `map.md` with Destination, Notes, Decisions so far, Not yet specified and Out of scope; `Children:` lists its tickets.
- **Blocking:** `Blocked by:` lists direct dependencies; a blocker is satisfied when it is `resolved` or `closed`.
- **Frontier:** children of the map with `Status: open`, no assignee, no open blockers and not `ready-for-human`, lowest priority number first (P1 before P2), then lowest ticket number.

## When a skill says "publish to the issue tracker"

Create or update the ticket file and its index row and map link. Implementation tickets state acceptance criteria, non-goals, dependencies and required checks, and reference the spec.

## When a skill says "fetch the relevant ticket"

Read the local file; resolve a bare number via the index.
