# Phase 1 Professional Platform Compatibility Strategy

Phase 1 does not mutate production data. Existing `businessAccounts/{uid}` records with `status == "active"` remain authoritative and continue to unlock the Business Builder, publishing callables, public profile reads, and business media. They do not need a retroactive application to remain active.

Legacy `users/{uid}.isBusiness` and `users/{uid}.businessStatus` values are compatibility projections only. They are never accepted as proof of Business Status by rules or callable functions. New approvals and account lifecycle actions update these fields for older UI surfaces, but authorization always reloads `businessAccounts/{uid}`.

The new server-owned `directoryEligible` field may be absent on a legacy active account. During the compatibility window, public Firestore and Storage access uses the authoritative combination of an active Business Account and published content, so missing `directoryEligible` does not hide an existing valid studio. Any subsequent Business Profile save sets `directoryEligible` consistently on both the account and profile.

Before enforcing `directoryEligible == true` as a mandatory rules predicate, a separately approved migration must:

1. Scan, without writing, all Business Accounts and report missing/invalid statuses, orphaned owners, and legacy user projections.
2. Derive eligibility from `businessAccounts.status == "active"` plus a published Business Profile and non-blocking moderation state.
3. Backfill only `directoryEligible` and missing safe timestamps/projections; never infer approval evidence or reviewer identity.
4. Map legacy Job Application `rejected` to `not_selected` only after reporting counts and confirming no consumers still require the old value.
5. Preserve active, suspended, and removed accounts and emit an auditable before/after report.

Running that migration against production, changing Firebase projects, or deleting legacy data requires explicit approval. No such action is part of Phase 1.
