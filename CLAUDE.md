# textsiegel

Invisible, sentence-bound marking of AI-generated chatbot text, plus a verification service. Library and service are independent of any single chatbot ([ADR-0006](docs/adr/0006-independent-english-mit.md)); Fragbar is one user among others.

- What it does and how to use it: [README.md](README.md)
- How to integrate it into a chatbot: [AGENTS.md](AGENTS.md) – written for agents working in *another* repository
- Authoritative behaviour: [docs/specs/textsiegel.md](docs/specs/textsiegel.md) and [spec/test-vectors.json](spec/test-vectors.json)
- Terms: [GLOSSARY.md](GLOSSARY.md); decisions: [docs/adr/](docs/adr/)

## Language

Everything is English: code, comments, tests, docs, UI, commit messages and PR texts ([ADR-0006](docs/adr/0006-independent-english-mit.md)). Exceptions: the German sample texts and the German Choice-Point-Mark classes, because the statistical layer is defined for German text. Conversations with Daniel may be German.

## Workflow

1. **Ticket first.** Work starts from a ticket in [.scratch/textsiegel/](.scratch/textsiegel/README.md) ([issue tracker](docs/agents/issue-tracker.md)). No ticket, no code – create one, and ask Daniel when the scope or a decision is unclear.
2. **Decisions as ADRs.** A decision that is hard to reverse, surprising without context or the result of a real trade-off gets an ADR in `docs/adr/`: who decided, when, why, in which PR.
3. **Spec before code.** Behaviour changes update [docs/specs/textsiegel.md](docs/specs/textsiegel.md) first.
4. **TDD.** A failing test first, then the change. Bug fixes start with a test that reproduces the bug.
5. **Branch and PR.** `main` is protected: pull requests only, required checks `test`, `browser` and CodeQL, squash merge, linear history. Reviews by cubic and opencode review (Alibaba) before merge. Merge only on Daniel's go.
6. **Test quality review** before a behaviour change is declared done: [docs/agents/test-quality-review.md](docs/agents/test-quality-review.md).

## Rules that protect the format

- Never change the meaning of an existing version byte (`0xF2`, `0xF3`). A change to the marker layout, the content key, the HMAC contexts or the sentence hash needs a **new version byte**, new test vectors (`npm run test-vectors`) and an ADR. Verifiers keep accepting old versions.
- Carriers are ZWNJ/ZWJ/Word Joiner on purpose ([ADR-0002](docs/adr/0002-carriers-zwnj-zwj-wj.md)); do not "optimize" them without new copy-paste measurements in Gmail, Outlook Web and Word.
- The verification service stores no submitted text and logs no text ([ADR-0008](docs/adr/0008-verification-service-code-of-practice.md)); a test guards this.
- Secrets (`MARK_KEY`, Ed25519 private keys) never enter the repository, logs or frontend bundles.

## Commands

```sh
npm run lint           # Biome (lint only; formatting is not enforced)
npm test               # Node tests
npm run build          # tsc → dist/
npm run test:browser   # Playwright, Chromium/Firefox/WebKit (once: npx --prefix e2e playwright install)
npm run server         # test page, check page and API on :8787
npm run test-vectors   # regenerate spec/test-vectors.json – only together with a new version byte
```

## Environment

### GitHub CLI (`gh`)

`gh` keeps its token in the macOS keychain, not in `~/.config/gh/hosts.yml`. If `gh auth status` reports "The token in default is invalid", the token is usually not expired but unreadable for the current process (sandbox). Run with full access, or set `GH_TOKEN` for headless agents. Pushing workflow files needs the `workflow` scope (`gh auth refresh -h github.com -s workflow`).

### Deployment

The verification service runs on the VPS HermesAgent under `/opt/textsiegel` (Docker, systemd timer pulls `ghcr.io/kokosnuss7777/textsiegel:latest` every 5 minutes), reachable only in the tailnet ([ADR-0007](docs/adr/0007-pull-deployment-ghcr-tailnet.md)). The check page is on GitHub Pages. Nothing in CI has access to the VPS.

## Agent skills

### Issue tracker

Tickets and the Wayfinder map are Markdown files in [.scratch/textsiegel/](.scratch/textsiegel/README.md). See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md). GitHub is used for pull requests, reviews and CI only.

### Triage labels

`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Single context: `GLOSSARY.md` and `docs/adr/` at the repo root. See [docs/agents/domain.md](docs/agents/domain.md).

### Test quality review

For changes to behaviour or tests, apply [docs/agents/test-quality-review.md](docs/agents/test-quality-review.md) before finishing: independent OCR delegation review with explicitly included test files, boundary and state checks, and demonstrated results instead of green tests alone.
