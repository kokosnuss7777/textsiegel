# Pull deployment from GHCR, tailnet only for now

Decision by Daniel (2026-10-31: tailnet only for now, migrate later; pull the image from GHCR), implemented in the initial commits on `main` (no PR).

GitHub Actions builds the container image and pushes it to GHCR. On the VPS HermesAgent, a systemd timer pulls the image every 5 minutes. GitHub has no access to the VPS. The service listens on `127.0.0.1:8790` and is exposed only in the tailnet via `tailscale serve`. The check page runs on GitHub Pages.

## Considered Options

- **Push deployment via SSH from Actions:** requires an SSH key with VPS access in GitHub secrets. Rejected.
- **Public exposure now:** not yet needed, and the service is not production-ready (see tickets). Deferred.

## Consequences

- The Pages check page cannot reach the tailnet API from browsers that block local network access (Chrome Local Network Access); the check page on the VPS itself works.
- Going public needs: contact address, expert tokens, `TEST_PAGE=0`, a domain or Funnel, and the P1 tickets fixed.
