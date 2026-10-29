# MSC-001 — Decision Register Review

**Task:** [MSC-001](../04-phased-agent-task-plan.md#msc-001--confirm-the-product-decision-register) · **Date:** 2026-10-29 · **Phase:** 1 — Decision baseline

This record reviews every decision row in [PRD §1](../01-product-requirements.md#1-decision-status-and-product-boundaries) against the approved brief in [AGENT.md](../../AGENT.md) and maps each row to its PRD requirement IDs. It changes no product decision.

## Decision register readback

| # | Decision | PRD status | Brief alignment | Requirement IDs |
|---|---|---|---|---|
| D1 | Martian Scrap Co. name | Approved | Matches; name search is not trademark clearance. | — (commercial boundary) |
| D2 | Complete premium Steam release | Approved | Matches; no early access, paid backend or monetization. | PRD-004 |
| D3 | First-person 3D; solo and up to four online players | Approved | Matches; not split-screen, every required activity works solo. | PRD-003, PRD-014, PRD-016–020 |
| D4 | Connected Mars scrapyard and buried station finale | Approved | Matches; surface station, no orbital map. | PRD-001, PRD-004, PRD-013 |
| D5 | Relaxing play; no enemies, mandatory timers or harsh penalties | Approved | Matches; survival is narrative motivation only. | PRD-002, PRD-003, PRD-008 |
| D6 | Shared credits and credit-led purchases | Approved | Matches; deliveries are occasional milestones. | PRD-009–012 |
| D7 | Host-owned campaign; guests help that world only | Approved | Matches; no guest carryover, no host migration. | PRD-016, PRD-020 |
| D8 | Colorful industrial low-poly art; rounded robot variants; UI direction | Approved | Matches; silhouettes remain exploration. | PRD-001, PRD-022 |
| D9 | Three.js + Electron, empty-project start | Approved | Matches; no reused game source. | PRD-021, PRD-022 (platform) |
| D10 | Windows KB/M and controller; Deck goal | Approved / Validation required | Matches; no Deck Verified or hardware claim. | PRD-022 |
| D11 | Minimum six-hour first-time four-player campaign | Approved target / Validation required | Matches; excludes optional content, no padding, not solo ÷ 4. | PRD-013, PRD-014, PRD-015 |
| D12 | EUR 5 reference | Deferred | Matches; price decided after the full game exists. | — (commercial boundary) |
| D13 | Zero additional spending | Approved constraint (§1 prose) | Matches; Steam fee covered, existing subscriptions allowed. | All |

No row conflicts with the brief. No Proposed item was promoted to Approved during this review.

## Requirement traceability map

| Requirement | Title | Status | Decision rows |
|---|---|---|---|
| PRD-001 | Tangible transformation | Approved | D4, D8 |
| PRD-002 | Enjoyable physical recycling | Approved | D5 |
| PRD-003 | Calm cooperation | Approved | D3, D5 |
| PRD-004 | Complete campaign | Approved | D2, D4 |
| PRD-005–008 | Handling scales, batch classification, compaction/sale, dismantling | Approved intent; Proposed implementation | D5, D6 |
| PRD-009–012 | Tools, credits, finite-world solvency, support automation | Approved / Proposed / Validation required | D6 |
| PRD-013 | Four-player duration | Approved target; Validation required | D4, D11 |
| PRD-014 | Solo parity | Approved; Proposed tuning | D3, D11 |
| PRD-015 | Optional continuation | Proposed | D11 |
| PRD-016 | Session ownership | Approved | D3, D7 |
| PRD-017–020 | Joining/privacy, spending permissions, integrity, leave/rejoin | Proposed / Required behavior | D3, D7 |
| PRD-021 | Safe progress | Required; Proposed implementation | D9 |
| PRD-022 | Input and readable UI | Approved direction; Validation required | D8, D10 |

## Owner confirmation (acceptance)

The acceptance criterion requires the owner to confirm **no change** to:

1. Mars setting with buried surface-station finale (D4).
2. Host-owned saves; guests help only the host world (D7).
3. Solo plus up to four online players (D3).
4. Minimum six-hour first-time four-player target (D11).
5. Zero additional spending (D13).

**Owner decision (2026-10-29):** Confirmed — no changes to any of the five constraints. The decision register stands as recorded in PRD §1.

## Open items carried forward

- Content hypotheses (roster, tools, sectors) → MSC-002.
- Privacy, spending permissions, host exit and V0 voice decision → MSC-003.
- Personal progression and test access inventory → MSC-004.
