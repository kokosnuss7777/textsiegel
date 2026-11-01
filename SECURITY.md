# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately via
[GitHub private vulnerability reporting](https://github.com/kokosnuss7777/textsiegel/security/advisories/new).

Relevant are in particular:

- ways to forge a valid signature (0xF2) or provenance marker (0xF3) without the key,
- ways to make the verification service report "signed"/"verified" for text that was not marked,
- leaks of submitted text or keys through the verification service, logs or reports,
- vulnerabilities in the server (`server/`) or in the deployment files (`deploy/`).

You will get an answer within 7 days. Please allow up to 90 days for a fix before public disclosure.

## Supported versions

Only the latest release and the `main` branch receive security fixes.

## Keys

Never commit marking keys (`MARK_KEY`) or Ed25519 private keys. If a key was exposed, rotate it: issue a new
Ed25519 key with a new key ID (keep the old public key published with `validTo` for verification of older texts)
and a new `MARK_KEY` for future responses.
