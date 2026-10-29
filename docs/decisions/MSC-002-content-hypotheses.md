# MSC-002 — First-Pass Content Hypotheses

**Task:** [MSC-002](../04-phased-agent-task-plan.md#msc-002--approve-first-pass-content-hypotheses) · **Date:** 2026-10-29 · **Phase:** 1 — Decision baseline · **Depends on:** [MSC-001](MSC-001-decision-register-review.md)

Decision log for the three content hypothesis sets in [PRD §§3–5](../01-product-requirements.md#3-collection-and-processing-rules). Approving them here means **"use as the first-pass set to build and test"**. Names, counts, prices, yields, tier counts and minutes stay **provisional** until measured evidence at later gates (MSC-020, MSC-040, MSC-050, MSC-060, MSC-110) confirms or revises them.

## H1 — Material families (PRD-005–008)

| Family | Fiction | Compatible collection | Status after review |
|---|---|---|---|
| Ferrous scrap | Real | Ordinary magnetic collector | Provisional |
| Aluminum | Real | Hand/cart or grip tool; not ordinary magnet | Provisional |
| Copper | Real | Grip/cable tool; not ordinary magnet | Provisional |
| Polymer | Real | Hand/cart or grip tool (suction collector removed) | Provisional |
| Heliofoil | Fictional | Proposed sheet clamp | Provisional |
| Regolith ceramic | Fictional technology | Hand/cart or pad gripper | Provisional |

Rule kept: each family must earn its complexity; the roster does not grow to extend duration. Fictional families need explicit compatibility rules.

## H2 — Tool families (PRD-009–012)

| Family | Initial purpose | Upgrade branch (examples, provisional) |
|---|---|---|
| Magnetic collector | Small ferrous sweeps | Reach; intake stability; material filter. |
| Grabber / sheet clamp | Non-ferrous pieces and panels | Grip width; rotation; assisted placement. |
| Cutter | Predefined assembly joints | Joint visibility; reach; separation control. |
| Cart | Medium loads and compacted output | Capacity; turning; unloading. |
| Portable container | Small collected batches | Capacity; unload control; material readout. |
| Base facilities | Sorting, compaction, local transport | Hopper capacity; compactor throughput; short conveyors. |

Rule kept: every upgrade changes an observable limit or affordance; prices and tier counts follow measured loop times.

## H3 — Sector sequence and pacing (PRD-013–015)

| Order | Sector / beat | Group minutes (hypothesis) |
|---:|---|---:|
| 1 | Receiving flats and starter bay | 35 |
| 2 | Rover berm | 55 |
| 3 | Solar terraces | 60 |
| 4 | Fabrication ridge | 65 |
| 5 | Station crown excavation | 65 |
| 6 | Station service ring | 55 |
| 7 | Station dismantling finale | 55 |
| | **Main campaign total** | **390** |

Rules kept: minutes are four-player group elapsed time, not person-hours and not a measured result; optional collectibles, side deliveries and extra upgrades contribute **zero** to the six-hour target; no waits or grind pad the clock; all sectors are one connected yard.

## Owner decision

**Decision (2026-10-29):** Approved H1, H2 and H3 as the **provisional first-pass set**, with one revision:

- **Polymer:** the proposed suction-compatible collector is removed. Polymer is collected by hand, cart or grip tool. This keeps the tool catalog at six families; a suction tool may only return as a separately approved upgrade.

Everything else stays provisional as listed. Optional content still contributes zero to the six-hour target.

## Walkthrough notes

- Each material introduces one distinct rule (magnet, non-magnet, cut first, release frame, separate panels); families that test as behaviorally identical are merged rather than kept for count.
- Free baseline access to a basic collector, cart, intake and sale method protects against purchase softlocks (PRD-011).
- The 390-minute hypothesis leaves only a 30-minute margin over the six-hour target; MSC-110 measures it.
