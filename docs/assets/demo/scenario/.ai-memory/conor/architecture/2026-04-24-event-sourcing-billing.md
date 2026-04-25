# Event sourcing for the billing audit log

> **Date**: 2026-04-24  
> **Author**: conor  
> **Source**: cursor:7a2b9c41  
> **Conversation**: Designing the billing audit log

---

**Context**: Compliance requires a tamper-evident audit log of every billing change (invoice created, line item modified, payment captured, refund issued). Today the invoices table is updated in place and previous state is lost.

**Content**: The billing domain becomes event-sourced. The source of truth is an append-only `billing_events` Postgres table (`InvoiceCreated`, `LineItemAdjusted`, `PaymentCaptured`, etc.), each row carrying a SHA-256 hash chain over `(prev_hash, payload, timestamp)`. The current invoices table becomes a read-side projection rebuilt from the log. The rest of the app stays on the existing CRUD model — only billing needs this.

**Reasoning**: Event sourcing answers compliance directly: every state change is a first-class, immutable record. Hash-chaining provides tamper evidence without an external service. Scoping to billing keeps the operational cost contained.

**Alternatives**: Shadow-table journaling rejected — couples write-side logic to bookkeeping and does not give tamper evidence. External audit-log service rejected — added vendor cost without measurable gain over an in-database hash chain.

**Impact**: `billing_events` is `REVOKE UPDATE, DELETE` from the application role; only the migration role can touch it. Projection rebuilder is deterministic + idempotent so it can replay from any point. A nightly hash-chain integrity check job ships alongside the projection.
