# A forged 0xF3 marker overrides a valid HMAC verdict

- Issue: 09
- Status: open
- Type: implementation
- Labels: bug, security, P2, ready-for-agent
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: opencode review (Alibaba), 2026-10-31, finding 9
- Created: 2026-10-31

## Problem

`src/service.ts:171`: appending an invented 0xF3 marker to a genuine 0xF2-signed text turns the public verdict from `signed` into `unverified`, while the internal HMAC check stays valid.

## Acceptance criteria

- [ ] Spec defines how internal and public verdicts combine: an unverifiable marker must not downgrade a verified one; it is reported separately.
- [ ] RED first: genuine 0xF2 text plus forged 0xF3 marker still reports the HMAC result as the verdict.

## Comments
