# Authenticated write endpoint for provenance records

- Issue: 20
- Status: open
- Type: implementation
- Labels: P2, needs-triage
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: [#21](21-record-retention.md)
- Source: Open item from the prototype session
- Created: 2026-10-31

## Problem

Public provenance needs records in the directory, but the service has no write path. AGENTS.md section 7 tells integrators to share `RECORDS_DIR` or build one.

Spec: [§5 record](../../../docs/specs/textsiegel.md#5-provenance-marker-0xf3-and-record) and [§10 endpoints](../../../docs/specs/textsiegel.md#10-verification-service).

## Non-goals

- Deleting or updating records (retention is ticket 21).
- Writing records from the browser or without a token.

## Acceptance criteria

- [ ] `PUT /v1/records/{id}` with authentication (token per chatbot deployment), validates the Ed25519 signature and key ID before storing, refuses overwrites.
- [ ] `{id}` must match the spec's format (exactly 16 lowercase hex characters) and equal the record's `responseId`; anything else gets `400` before any file system access. The ID is the storage filename.
- [ ] Tests for wrong signature, wrong ID, path-like IDs (`../x`, `%2e%2e%2f`, `a/b`, 15 and 17 characters), missing token, overwrite.

## Comments
