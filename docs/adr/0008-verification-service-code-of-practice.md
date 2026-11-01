# Verification service along the Code of Practice

Decision by Daniel (2026-10-31, "Ja, umsetzen" after reading the Code of Practice on marking and labelling of AI-generated content), implemented in the initial commits on `main` (no PR).

The verification service implements the measures of the Code of Practice that apply to a provider with its own marking:

- Free verification (2.1.1), with an hourly rate limit per client and unlimited access for experts via token.
- Public check page and API (2.1.2), and a downloadable report signed with Ed25519.
- The statistical result for free-form text only for experts (2.1.2).
- Zero retention (2.1.3): submitted text only in memory; logs contain timestamp, verdicts and counts only, guarded by a test.
- Clear results with the technique named (2.3).
- An about page and the signpost `/.well-known/textsiegel.json` (3.4).

## Considered Options

- **Check page only in the chatbot:** not public, not usable by authorities. Rejected.
- **Show the statistical result publicly:** too many false impressions for free-form text; the Code allows restricting it. Rejected.

## Consequences

- The Commission's guidelines (Rn. 76) allow a provider's own solution until standards exist; interoperability (3.4) is to be revisited by 2 Feb 2027.
- This is not legal advice.
