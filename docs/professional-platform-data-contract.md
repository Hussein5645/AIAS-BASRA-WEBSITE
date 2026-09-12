# AIAS Basra Professional Platform Data Contract

**Version:** 1.0  
**Status:** Normative source of truth  
**Scope:** Business onboarding, the professional directory, business content, opportunities, opportunity applications, and professional connections.

## 1. Authority and security model

This contract is authoritative for future backend code, Firestore and Storage rules, UI state, tests, migrations, and denormalized records. Existing data or code that conflicts with it is legacy behavior to remediate explicitly in a later phase; this document does not itself migrate data or change runtime behavior.

The platform recognizes four access classes:

- **Public:** readable without authentication, but only when the parent resource is eligible for public display.
- **Owner-only:** readable or editable only by the authenticated owner identified from `request.auth.uid`, never from a client-supplied owner field.
- **Admin-only:** readable or mutable only by an authenticated administrator with the required server-validated permission.
- **Server-owned:** mutable only by trusted Cloud Functions/Admin SDK code. Firestore and Storage rules must deny direct client writes.

Sensitive lifecycle operations must use callable functions. Each function must derive the actor from Firebase Authentication, load authoritative source documents, validate the requested transition, and write all primary and denormalized records atomically when practical. Client input is a request, not proof of ownership, business eligibility, verification, application membership, or status.

## 2. Canonical statuses and lifecycles

Status values are lowercase strings and must be rejected if not listed here. Status timestamps are server timestamps.

### 2.1 Business status — `businessAccounts/{businessUid}.status`

| Status | Meaning | Allowed next states | Set by |
|---|---|---|---|
| `pending` | A submitted business application is awaiting a decision; no business privileges or directory eligibility. | `active`, `removed` | Server from application/admin action |
| `active` | Approved and permitted to use business features, subject to content-level publication and moderation checks. | `suspended`, `removed` | Admin through server |
| `suspended` | Temporarily ineligible for directory display, publishing, and business operations; retained for review/restoration. | `active`, `removed` | Admin through server |
| `removed` | Business privileges are revoked and the business is excluded from all public professional surfaces. This is a retained terminal record, not a hard delete. | None by default; a new application is required | Admin through server |

`active` does not itself mean verified, published, or publicly listed. Public directory eligibility is a server-computed conjunction of active status, approval/verification requirements, published profile state, and absence of blocking moderation state.

### 2.2 Business application status — `businessApplications/{applicationId}.status`

| Status | Meaning | Allowed next states | Actor |
|---|---|---|---|
| `draft` | Owner-only application being prepared; not visible to reviewers. | `submitted`, `withdrawn` | Applicant through server |
| `submitted` | Immutable submission snapshot awaiting triage. | `under_review`, `withdrawn` | Server on submit; applicant may withdraw |
| `under_review` | An administrator has started review. | `approved`, `rejected`, `withdrawn` | Admin through server; applicant may withdraw |
| `approved` | Review succeeded; server activates/creates the matching business account. | None | Admin through server |
| `rejected` | Review ended without approval; retained with admin-only decision details. | None | Admin through server |
| `withdrawn` | Applicant ended the application; no further review or activation is allowed. | None | Applicant through server |

Only one non-terminal application (`draft`, `submitted`, or `under_review`) may exist for a user at a time. Approval and the corresponding business-account activation must be one trusted, atomic operation. Review notes, reviewer identity, rejection reasons, and decision timestamps are not public.

### 2.3 Opportunity status — `businessOpportunities/{opportunityId}.status`

| Status | Meaning | Allowed next states | Actor |
|---|---|---|---|
| `draft` | Owner-only listing under preparation. | `open`, `archived` | Business owner through server |
| `open` | Public and accepting applications. | `closed`, `filled`, `expired`, `archived` | Owner for close/fill/archive; server for expiry |
| `closed` | Public historical listing that no longer accepts applications. | `open`, `filled`, `archived` | Business owner through server |
| `filled` | Public historical listing whose opening has been filled; no applications accepted. | `archived` | Business owner through server |
| `expired` | Deadline passed and the server closed intake; no applications accepted. | `open`, `archived` | Server; owner may reopen with a valid future deadline |
| `archived` | Hidden from public discovery and retained for owner/admin records. | `draft` | Business owner through server, subject to moderation restrictions |

Only `open` accepts new applications. Public reads are limited to eligible business owners' `open`, `closed`, `filled`, and `expired` listings. `draft` and `archived` are owner/admin only. Moderation can suppress any status without changing owner-authored content.

### 2.4 Opportunity application status — `jobApplications/{applicationId}.status`

| Status | Meaning | Allowed next states | Actor |
|---|---|---|---|
| `new` | Submitted and not yet reviewed. | `reviewed`, `shortlisted`, `interview`, `accepted`, `not_selected`, `withdrawn` | Server on submit; business reviews; applicant withdraws |
| `reviewed` | Business has reviewed the application. | `shortlisted`, `interview`, `accepted`, `not_selected`, `withdrawn` | Hiring business; applicant withdraws |
| `shortlisted` | Applicant remains under active consideration. | `interview`, `accepted`, `not_selected`, `withdrawn` | Hiring business; applicant withdraws |
| `interview` | Applicant is in the interview stage. | `accepted`, `not_selected`, `withdrawn` | Hiring business; applicant withdraws |
| `accepted` | Business accepted the application. | None | Hiring business through server |
| `not_selected` | Business ended consideration without acceptance. | None | Hiring business through server |
| `withdrawn` | Applicant ended their candidacy. | None | Applicant through server |

The canonical negative decision is `not_selected`; legacy `rejected` values must be mapped in a later explicit migration. Applicants may create only for themselves and may only request withdrawal of their own non-terminal application. Businesses may update only review fields for applications whose authoritative opportunity owner is their UID. Neither party may edit identity snapshots, ownership, opportunity linkage, submission content, or timestamps after submission.

## 3. Professional connection decision

**Connect is a request requiring acceptance, not an immediate connection.**

A canonical connection request is directed from requester to recipient and has status `pending`, `accepted`, `declined`, `withdrawn`, or `cancelled`:

- The authenticated requester may create one `pending` request for themselves and may change their own pending request only to `withdrawn`.
- The authenticated recipient may change a pending request to `accepted` or `declined`.
- Either participant may end an accepted connection; the server records `cancelled` and removes/revokes derived connection access.
- Acceptance is the only event that creates server-owned connection projections for both participants.
- Requests, decisions, timestamps, participant IDs, notifications, and connection projections are written by callable functions. Clients cannot directly create an accepted relationship.
- Pending/declined/withdrawn request details are visible only to the two participants and authorized admins. Accepted connection projections may expose only the minimal public fact required by product UI; private contact or request metadata remains participant/admin only.

The current immediate, one-way client-written connection is legacy behavior and does not satisfy this contract.

## 4. Data visibility contract

| Data | Public | Owner | Relevant business/reviewer | Admin | Write authority |
|---|---:|---:|---:|---:|---|
| Business account eligibility/status | Minimal public projection only | Yes | N/A | Full | Admin/server |
| Business application draft and applicant data | No | Yes | N/A | Only after submission | Applicant content through server; lifecycle/review server-owned |
| Business application review/decision data | No | Decision result | N/A | Yes | Admin through server |
| Published, eligible business profile | Yes | Yes | N/A | Yes | Owner content through server; eligibility/verification server-owned |
| Draft or suppressed business profile | No | Yes | N/A | Yes | Owner content through server; moderation admin/server |
| Published eligible business posts | Yes | Yes | N/A | Yes | Owner content through server; moderation/denormalization server-owned |
| Draft/suppressed business posts | No | Yes | N/A | Yes | Owner content through server; moderation admin/server |
| Public opportunity (`open`, `closed`, `filled`, `expired`) | Yes, if directory-eligible and not suppressed | Yes | N/A | Yes | Owner content through server; lifecycle timestamps/eligibility server-owned |
| Draft/archived opportunity | No | Yes | N/A | Yes | Owner content through server; status effects server-owned |
| Submitted opportunity application | No | Applicant | Hiring business | Yes | Applicant submission through server |
| Application review fields | No | Read-only | Hiring business | Yes | Hiring business through server |
| Connection request | No | If participant | If participant | Yes | Participants through server transitions |
| Accepted connection projection | Minimal public fact if needed | Yes | If participant | Yes | Server only |
| Verification evidence, reviewer notes, moderation reasons/audit | No | Only explicit safe outcome/message | No | Yes | Admin/server only |

Public queries must be satisfiable by rules using server-owned eligibility/status fields; a client-side filter is not an authorization boundary. Private contact fields such as application email/phone, internal notes, verification evidence, and moderation records must not be stored in an otherwise public document. Use private authoritative documents plus minimal public projections where necessary.

## 5. Field-ownership matrix

Field groups are exhaustive allowlists. New fields default to **server-owned** until this contract is amended and matching validation is implemented.

| Resource | Business owner / applicant fields | Business review fields | Admin fields | Server-owned fields |
|---|---|---|---|---|
| `businessAccounts/{businessUid}` | None | N/A | `status` transition request, private `notes`, suspension/removal reason | `communityUid`, `businessProfileId`, `businessName` projection, `approvedBy`, `approvedByUid`, `approvedAt`, suspension/restoration/removal timestamps and actors, `directoryEligible`, `createdAt`, `updatedAt` |
| `businessApplications/{id}` | Draft content: legal/display name, registration/contact details, description, website, submitted evidence references; submit/withdraw intent only | N/A | Review notes, verification checks, approve/reject decision | `applicantUid`, `status`, submission snapshot/hash, reviewer identity, all lifecycle timestamps, linked `businessUid`, `createdAt`, `updatedAt` |
| `businessProfiles/{businessUid}` | `name`, `username`, `logoUrl`, `coverUrl`, `industry`, `location`, `shortDescription`, `about`, `website`, `contactEmail`, `contactPhone`, `address`, `companySize`, `services`, `specializations`, `socialLinks`, `gallery`, publication intent | N/A | Moderation action/reason | `id`, `ownerUid`, effective publication/moderation state, verification projection, `directoryEligible`, denormalized/search fields, `createdAt`, `updatedAt`, publication timestamps |
| `businessPosts/{postId}` | `title`, `content`, `category`, `imageUrl`, publication intent | N/A | Moderation action/reason | `id`, `ownerUid`, effective `status`, business identity projections, moderation fields, public eligibility, `createdAt`, `updatedAt`, publication timestamps |
| `businessOpportunities/{id}` | `type`, `title`, `description`, `location`, `deadline`, `openings`, `skills`, `software`, job/internship detail fields, lifecycle intent | N/A | Moderation action/reason | `id`, `ownerUid`, effective `status`, business identity projections, directory eligibility, moderation fields, `createdAt`, `updatedAt`, `publishedAt`, `closedAt`, `filledAt`, `expiredAt`, `archivedAt` |
| `jobApplications/{id}` | Applicant: `coverLetter`, selected own work IDs at creation; withdrawal intent afterward | Hiring business only: review `status`, private review notes, interview metadata | Moderation/audit access; exceptional administrative transition with audit | `id`, `opportunityId`, `businessUid`, `applicantUid`, portfolio/identity snapshots, validated selected-work snapshots, effective `status`, status actor/timestamps, `createdAt`, `updatedAt` |
| Connection requests/projections | Requester: create/withdraw intent; recipient: accept/decline intent | N/A | Moderation/cancellation action | Participant IDs, effective status, all timestamps/actors, symmetric accepted-connection projections, notifications, derived access |
| Public business/directory projections | None | N/A | None directly | Entire document, derived only from authoritative eligible records |

## 6. Enforcement requirements

1. Direct client writes to business accounts, business applications after draft submission, status/verification/moderation fields, job applications, connection state, and public projections must be denied.
2. Owner-editable content must be accepted through narrow callable operations with explicit field allowlists, type/length/URL validation, and authoritative ownership/active-business checks.
3. Application submission must reload the opportunity, verify it is `open` and eligible, derive `businessUid`, enforce one application per applicant/opportunity, and validate every selected work belongs to the applicant.
4. Application review must reload both the application and opportunity, derive the hiring owner, permit only the transition table above, and preserve applicant-submitted content.
5. Withdrawal must verify `applicantUid == request.auth.uid` and must not overwrite a terminal decision.
6. Business approval, suspension, restoration, removal, verification, directory eligibility, expiration, and moderation must be server-side operations with audit records.
7. Storage paths must use authoritative Firestore ownership and eligibility checks. Uploading a file must not grant publication or access.
8. Denormalized public data must be generated from authoritative records, never copied blindly from callable input.
9. Rules and callable-function tests must cover cross-owner attempts, forged owner/business/application IDs, forged statuses/timestamps/verification, invalid transitions, duplicate submissions, inactive/suspended/removed businesses, and connection acceptance by non-recipients.

## 7. Known implementation gaps at Phase 0

This baseline intentionally records, but does not repair, the following observed conflicts:

- Business accounts currently omit the `pending` lifecycle and removal deletes the authoritative record instead of retaining `removed`.
- No canonical `businessApplications` workflow currently exists.
- Business profile, post, opportunity, and job-application rules currently permit broader direct client writes than this contract allows.
- Opportunities currently omit `expired` and `archived`.
- Opportunity applications currently use `rejected` instead of `not_selected`, lack applicant withdrawal, and allow overly broad business updates/deletes in rules.
- “Connect” currently creates an immediate one-way client-owned record rather than an accepted request and server-owned symmetric projection.
- Some verification and business identity values are currently denormalized without an explicit directory-eligibility contract.

Each gap must be remediated in an explicitly authorized later phase with rules, backend, UI, migration/backfill planning where needed, and lifecycle/security tests.
