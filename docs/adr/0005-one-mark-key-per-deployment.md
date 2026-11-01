# One mark key per deployment

Decision by Daniel (2026-10-31), implemented in the initial commits on `main` (no PR).

A deployment uses one `MARK_KEY` for all tenants; the tenant is the customer ID inside the signature. The verification service must hold the same key as the chatbot.

## Considered Options

- **One key per tenant:** key management per customer, and the Choice-Point-Mark p-value is multiplied by the number of keys (Bonferroni), which weakens statistical detection. Rejected.
- **Customer-supplied keys:** customers bring their own LLM API key, not a marking key. Not needed.

## Consequences

- Compromise of the key affects all tenants of the deployment; rotation is not supported by the server yet (see SECURITY.md).
