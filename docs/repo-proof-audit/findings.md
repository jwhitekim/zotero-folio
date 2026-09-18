# Findings — zotero-folio

## RP-NODE-001 — Incremental sync advances past items that failed to cache

- Category: Transaction / Concurrency
- Area: `server/` (Backend General)
- Severity / confidence: **HIGH / HIGH**
- Verification: **CODE_PROVEN**

`doSync` catches failures for individual changed items and deletion processing, but always writes `newVersion` afterward. Because future Zotero reads use that checkpoint as `sinceVersion`, a failed item that does not change again can remain permanently absent or stale.

Evidence: `server/server.js:177-235`, `server/zotero.js:35-59`.

Minimal remediation: advance only a contiguous successfully processed checkpoint, or durably retain failed keys for retry before/alongside checkpoint advancement.

## RP-NODE-002 — Webpage title lookup permits server-side requests to arbitrary hosts

- Category: Network / I/O
- Area: `server/` (Node.js specialization)
- Severity / confidence: **HIGH / HIGH**
- Verification: **CODE_PROVEN**

The webpage route accepts any `http://` or `https://` URL and fetches it from the server with default redirects. There is no resolved-address or redirect-hop policy, so authenticated users can target loopback, private, or link-local HTTP services.

Evidence: `server/server.js:133-148`, `server/server.js:382-390`.

Minimal remediation: validate resolved destinations and every redirect hop, reject non-public ranges, and bound the response size while retaining the existing timeout.

## RP-NODE-003 — Zotero requests have no deadline or cancellation propagation

- Category: Network / I/O
- Area: `server/` (Node.js specialization)
- Severity / confidence: **MEDIUM / HIGH**
- Verification: **CODE_PROVEN**

The Zotero client and OAuth helper await sixteen fetch sites without an abort signal. A stalled upstream can retain requests indefinitely, including inside paginated and sequential synchronization paths. The webpage-title helper already demonstrates a local deadline pattern.

Evidence: `server/zotero.js:37-382`, `server/oauth1.js:46-58`, `server/server.js:136-143`.

Minimal remediation: centralize Zotero fetches behind a small helper that supplies a documented deadline and, where useful, request cancellation.

## RP-NODE-004 — Attachment proxy buffers and inflates complete files on the event loop

- Category: Application Performance
- Area: `server/` (Node.js specialization)
- Severity / confidence: **MEDIUM / MEDIUM**
- Verification: **SUSPECTED**

PDF and HTML attachments are fully materialized as `ArrayBuffer` and `Buffer`; ZIP snapshots are then synchronously parsed and inflated by AdmZip. No size bound is present. The mechanics are static facts, but actual memory and event-loop impact depends on attachment sizes and concurrency.

Evidence: `server/zotero.js:150-159`, `server/server.js:450-492`, `docs/stack-choice-and-scaling.md:34-47`.

Minimal remediation: stream PDFs with cancellation and byte limits; bound compressed and expanded HTML entries, moving extraction off the event loop only if measurement justifies it.

## RP-WEB-001 — A completed stale autosave can erase the newer recoverable draft

- Category: Frontend Async / Lifecycle
- Area: `web/` (Frontend Web)
- Severity / confidence: **MEDIUM / HIGH**
- Verification: **CODE_PROVEN**

An autosave sends snapshot A, but after awaiting it reads live `markdown` state and unconditionally clears the session draft. If the user types B while A is in flight, A can clear B; navigating away before B's new 900 ms timer fires cancels that timer and loses B. This contradicts the README recovery promise.

Evidence: `web/src/components/MarkdownNote.svelte:118-169`, `README.md:105-107`.

Minimal remediation: capture the submitted snapshot and clear only when current/stored content still matches it; preserve or explicitly flush newer content during teardown.

## RP-WEB-002 — Collection responses can overwrite the currently selected collection

- Category: Frontend Async / Lifecycle
- Area: `web/` (Frontend Web)
- Severity / confidence: **MEDIUM / HIGH**
- Verification: **CODE_PROVEN**

Every collection response assigns shared `papers` state regardless of which collection is still selected. Reordered responses can therefore show A's papers beneath B's heading. The search page already contains a request-generation guard that can be reused.

Evidence: `web/src/pages/Collections.svelte:28-35`, `web/src/pages/Collections.svelte:46-63`, `web/src/pages/SearchPapers.svelte:17-43`.

Minimal remediation: commit results and loading state only when the response generation or key still matches the current selection.

## Explicit non-findings

- The 2,157-line PDF viewer was not treated as a design defect based on length alone.
- Redis, worker threads, interfaces, locks, memoization, and extra indexes were not recommended merely because they are absent.
- The title index was not called useless without a query plan and production data distribution.
- Existing duplicated client/server validation constants were not labeled semantic duplication because they enforce separate trust boundaries.
