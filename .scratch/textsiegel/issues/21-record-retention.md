# Decide the retention period for provenance records

- Issue: 21
- Status: open
- Type: grilling
- Labels: needs-info, ready-for-human
- Assignee: -
- Parent: [map](../map.md)
- Blocked by: -
- Source: Open item from the prototype session
- Created: 2026-10-31

## Question

How long are provenance records kept? No legal minimum was found; the Code of Practice asks for limited retention under the deployer's control. A record ([spec §5](../../../docs/specs/textsiegel.md#5-provenance-marker-0xf3-and-record)) holds no text, but more than hashes: `keyId`, `responseId`, `customer` (a pseudonymous string identifier chosen by the deployment), `createdAt` (a timestamp per response), `salt`, `model` (when known) and the sentence hashes. Timestamp, customer and model together describe usage over time, so at millions of responses they need a deletion policy.

## Outcome

ADR with the retention period and who controls it; implementation ticket for deletion.

## Comments
