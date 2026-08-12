# Opus OS — Competitive map (vs OPAS)

OPAS (Orchestra Planning & Administration System) is the incumbent many top-tier orchestras use. Opus OS aims at that **class** of product, grown from this Hub — not a greenfield rewrite.

| OPAS-class capability | Hub today (NWSA) | Opus OS next (directional) |
|----------------------|------------------|----------------------------|
| Calendar / services / events | Unified calendar, ICS feeds, import | Multi-org calendars; richer service types |
| Personnel / roster / assignments | Ensembles, roster, overrides, attendance | Contracts-aware assignments; extras workflow |
| Repertoire / library | Repertoire library, parts URLs, programs | Deeper library ops; rental/catalog hooks later |
| Contracts (extras, soloists, guest) | Not core | Explicit module when selling to pros |
| Musician portal | Public site + student lookup | Full musician portal parity |
| Touring / venues | Events + venues as needed | Touring packs when demanded |
| Reporting / history | Attendance charts, programs | Season history, export, board packs |
| APIs / integrations | Firebase; GitHub Actions | Public API when second customer needs it |

## Pricing / positioning (later)

TBD when selling. Until then: ship NWSA value; keep schema and UX from assuming “only one school forever” when a general design costs little.

## Related experiments (parked)

- `~/orchestration_hub` — Django rental catalog; possible later library/rental module. Not merged yet.
- Stale Hub clones under `Documents/GitHub/nwsa-music-hub`, `Documents/Maestro` — **non-canonical**. Live code is this repo only.
