# RepoProof — zotero-folio

Repository Audit of `jwhitekim/zotero-folio` at `c39928784c902fe2567ee83a766ae34d4db52c7a`.

## Result

| Measure | Result |
|---|---:|
| Overall | **69.4 / 100** |
| Applicable points | 86 / 124 |
| Evidence coverage | 78% |
| Runtime verification | None |
| Critical / High / Medium / Low | 0 / 2 / 4 / 0 |

The score is normalized only across applicable categories. Change Discipline is N/A in Audit mode, and Caching / Distributed Concerns is N/A because the repository provides no evidence that a remote cache is required. Absence of Redis was not penalized.

## Applied areas and profiles

- `.` — Core
- `web/` — Core + Frontend Web
- `server/` — Core + Backend General + Node.js specialization

No Java, Spring, Python, or database-specific framework profile was applied merely because backend concepts exist.

## Most important findings

1. **HIGH — Incremental sync advances past failed items.** Per-item and deletion failures are suppressed, then the global Zotero version checkpoint advances. A transient failure can therefore become a permanently missing or stale cache entry (`RP-NODE-001`).
2. **HIGH — Webpage title lookup is an SSRF path.** An authenticated user-controlled HTTP(S) URL is fetched from the server after only a scheme check, including default redirects (`RP-NODE-002`).
3. **MEDIUM — Zotero requests have no deadlines.** Sixteen integration fetch sites can remain pending without application cancellation (`RP-NODE-003`).
4. **MEDIUM, SUSPECTED impact — Attachments are fully buffered and ZIP HTML is synchronously inflated.** The mechanics are code-proven; production impact needs size and concurrency measurements (`RP-NODE-004`).
5. **MEDIUM — Memo autosave can erase the newer draft after an older save completes.** This contradicts the documented draft-recovery claim (`RP-WEB-001`).
6. **MEDIUM — Collection request responses can be applied out of order.** Papers from an older request can render under the newer selected collection (`RP-WEB-002`).

## Claim verification

- README draft-survival claim: **CONTRADICTED** by the edit-during-save/navigation path.
- Svelte runtime/bundle advantage claim: **UNVERIFIED**; no comparison or measurement is recorded.
- Supabase is not a concurrent-write bottleneck: **UNVERIFIED**; no workload or database metrics are recorded.

## Runtime status

Static verification continued without executing the target. No `npm install`, build, server, Docker, migration, or target-provided script was run. Runtime verification requires third-party packages, credentials, Supabase, Zotero and browser scenarios; lack of runtime access did not promote any finding to VERIFIED.

See [findings.md](./findings.md), [scorecard.json](./scorecard.json), [evidence.json](./evidence.json), and [repository-context.json](./repository-context.json).
