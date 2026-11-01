# HMAC signature by default, public provenance optional

Decision by Daniel (2026-10-31: "reicht es denn nicht, wenn wir nur erkennen, dass die Nachricht von Fragbar ist?", then "Ja, Etappe 2"), implemented in the initial commits on `main` (no PR).

The default marker is the HMAC signature (0xF2). It needs no storage: the verification service recomputes the HMAC with the mark key. Public provenance (0xF3) is optional. A provenance marker points to an Ed25519-signed record with sentence hashes only, so third parties can verify with the public key but need the directory.

## Considered Options

- **Ed25519 signature inside the marker:** 64 bytes signature → over 300 carriers per sentence. Too long for Gmail/Outlook robustness and paste limits. Rejected.
- **Only public provenance:** requires storing a record per response (millions of records, retention questions). Rejected as default.
- **Only HMAC:** third parties depend on the provider's service. Accepted as default, with provenance as an option.

## Consequences

- With HMAC, only the key holder's service can say "signed". This satisfies the Code of Practice as long as that service is free and public ([ADR-0008](0008-verification-service-code-of-practice.md)).
- There is no write endpoint for records yet; a deployment using provenance must share `RECORDS_DIR` or add an authenticated write path.
- Retention of records is an open decision.
