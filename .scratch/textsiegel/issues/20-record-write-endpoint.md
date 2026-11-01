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

## Acceptance criteria

- [ ] `PUT /v1/records/{id}` with authentication (token per chatbot deployment), validates the Ed25519 signature and key ID before storing, refuses overwrites.
- [ ] Tests for wrong signature, wrong ID, missing token, overwrite.

## Comments
