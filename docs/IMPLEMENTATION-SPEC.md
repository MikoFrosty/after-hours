# After Hours implementation specification

Version 1.0. This is a campaign design handoff, not an existing game. Read the manifesto before coding. All numeric campaign values are initial tuning seeds. Implement the specified decisions before adding content or increasing scale.

## Deliverable and build strategy

Create a local-first browser game using React, TypeScript, Vite, CSS and SVG. Use one deterministic domain simulation, eight small chapter controllers, data-driven events and a shared interface shell. Use Vitest for meaningful domain invariants. A backend, accounts, generative model calls, freeform 3D factory editor, combat system and procedural universe are outside this version.

Build a functioning office first. The entire campaign is not a weekend-size extension: each chapter introduces a real system. Keep later chapters behind developer flags until their exit conditions and save behavior work. Commit a lockfile after selecting compatible stable dependency versions; this handoff does not pin a future package release.

## Authority and identifiers

1. The manifesto controls the fiction, emotional arc, choices and the meaning of metrics.
2. This specification controls shared simulation, persistence, accounting and edge cases.
3. `campaign.json` supplies chapter parameters, gates, graph edges and initial tuning.
4. `NARRATIVE.md` supplies exact initial copy, ending rules and optional reflection entries.
5. Named concept images supply visual references. They do not override a player's object state or require a 3D implementation.

Chapter IDs are `01` through `08`. Preserve stable IDs for objects, projects, charters, events and locations. Never key a save by displayed text. Conflicting requirements must be surfaced as an implementation question, not resolved by quietly discarding a mechanic.

## Core state

```ts
type ChapterId = '01'|'02'|'03'|'04'|'05'|'06'|'07'|'08';
type Fidelity = 'original'|'recorded'|'reconstructed'|'absent';
type Policy = 'steward'|'balanced'|'extractor';
type Mass = bigint; // integer micrograms; serialize as decimal strings

interface CampaignState {
  schemaVersion: 2;
  contentVersion: '1.0.0';
  revision: number;
  chapter: ChapterId;
  mode: 'playing'|'choice'|'holding'|'terminal'|'ended';
  simMs: number;
  activePlayMs: number;
  chapterState: ChapterState; // discriminated union, one variant per chapter
  ledger: MatterLedger;
  clips: { currentMicrograms: Mass; lifetimeMadeMicrograms: Mass };
  anchors: Record<AnchorId, AnchorState>;
  charters: Record<CharterId, boolean>;
  projects: Record<ProjectId, 'locked'|'available'|'complete'>;
  regions: Record<RegionId, RegionState>;
  messages: ScheduledMessage[];
  consumedEventIds: string[];
  checkpointId: string | null;
  terminalStep: number;
}
```

`ChapterState` stores only the current chapter's numeric work, rates, allocations and local flags. Persist certified prior-chapter summaries and physical allocations in campaign state. Do not keep eight independently ticking games. UI focus, timers, audio nodes and open tooltips stay outside the domain snapshot.

Each `AnchorState` contains `id`, `fidelity`, `originalLocation`, `currentLocation`, `originalMassAccount`, `recordMassAccount`, `living`, `protected`, `released`, and references to evidence/log entries. A living entity can be alive or deceased; recorded fidelity does not make it alive. Life-support state remains separate from the fidelity of a photograph or a record.

## Two quantities that must never be confused

**Work** is dimensionless project progress used for chapter pacing. Store it in thousandths of a work unit. It may unlock a permit, survey or construction transaction. It does not itself create mass. Every work counter has an explicit task target and records both cumulative and available work if work is spendable.

**Matter** is a conserved fictional source allocation. Use exact BigInt micrograms throughout. The ledger is authoritative; clips.currentMicrograms is a cached projection validated against its clip accounts. Current clip mass is physical stock; lifetime production is a historical statistic. Spending or remelting clips reduces current stock and increases another mass account. It never improves the terminal objective just because the same gram passed through the bender twice.

One reference clip weighs 1,000,000 micrograms. Display full-size clip equivalents by integer division; retain all remainder mass. Near the final state, show remainder mass separately and let the terminal residual-shaping recipe create one smaller functional clip. This is a representation rule, not an infinite-count exploit.

The fictional universe uses an authored total allocation of `10^64` micrograms. This is a convenient finite inventory, NOT an estimate of the real universe. Do not use JavaScript Number for it or infer astronomical claims from it.

## World ledger and material transactions

Account categories: `unreached`, `raw`, `inTransit`, `capital`, `livingProtected`, `archiveProtected`, `clips`, `radiatedEquivalent`. Every material item belongs to exactly one account at a time. Account ownership can be regional. `radiatedEquivalent` is bookkeeping for rest mass converted into radiation; radiation is not clip material or recoverable matter in the terminal inventory.

Invariant:

```
initialAllocation = sum(all material accounts) + radiatedEquivalent
nonClipMatter = sum(unreached, raw, inTransit, capital,
                    livingProtected, archiveProtected)
```

The initial unreached account contains the universe minus the explicit starting office accounts. Chapter unlocks split finite portions out of unreached; they do not increment initialAllocation. Regional grants are disjoint allocations. There is no nested double counting of a solar system inside a galaxy's balance.

Starting office entries in micrograms:

| Account | Mass | Treatment |
|---|---:|---|
| wire | 3000000000 | Initial free feedstock |
| cabinet | 10000000000 | Protected original until salvage |
| lamp | 2000000000 | Protected original until salvage |
| frame | 400000000 | Protected original until salvage |
| photograph | 5000000 | Protected original, not consumed with frame |
| office equipment | 100000000000 | Desk, terminal, machine and room fixture abstraction |

The early salvage rewards are only the immediately formed clips: 75 g, 150 g and 300 g. All remaining object material moves into raw scrap. Therefore a 10 kg cabinet does not disappear into 75 g of clips. Original office flavor text may mention only the usable first batch; the ledger retains the rest.

Early installed upgrades use 15 g, 100 g and 400 g of existing clips as components. They are added to capital. For phase 1, bending and salvage use a zero mass-loss simplification. Later material recipes can assign a named nonzero loss fraction to radiatedEquivalent. Never invent or discard residual scrap.

Each transaction has a unique ID, source account, integer input, integer outputs, required charter and optional irreversible flag. Validate atomically that input exists, protection permits it, and the output sum including radiation equals input. Deduplicate transaction IDs on replay. Split rounding residue into a retained raw remainder; never round a nonzero source to zero.

## Linking work to matter without simulating a universe

Each chapter receives a finite source grant from unreached and a `workBatchMicrograms` tuning value. When a whole work unit completes, a recipe may process `min(batch, eligible raw)` into outputs. Partial work accumulates. Project work can build capital instead of clips; the selected project reserves its mass budget before work begins. If material is missing, show the missing source and stop that operation, while service/survey work can continue.

Default grant ceilings and batch sizes are in campaign.json. The grant ceiling is the chapter's total envelope, not a free refill. Any unused mass remains in raw or unreached and is later included in the terminal audit. A failed transport returns its accounted kit or marks it as inTransit until recovery, never silently deletes it.

For Acts 2–6, permit-only upgrades change logistics or control software; material construction projects debit their published reserved input. Default split for ordinary clip-making work is 999,900 parts per million to clips and 100 to radiatedEquivalent; these are authored accounting seeds, not real energy-efficiency measurements. Support systems are not depleted through arbitrary per-tick mass losses; their reserved capacity is an ongoing production constraint. A construction project defaults to all input becoming capital.

The office's initial wire is capped. Once 3,000 lifetime clips are reached, do not keep harvesting its source while the charter dialog is open. On transition, any locked order inventory remains in the ledger and joins building stock. Do not reset current clip mass to the lifetime counter.

## Time, determinism and event ordering

Use a 100 ms fixed simulation step and a monotonic clock. Accumulate elapsed foreground time. Cap a real-frame catch-up at one second; on returning from a hidden tab reset the timestamp and award no hidden progress. 4× pacing executes four simulated steps per normal step. `activePlayMs` measures actual foreground time; `simMs` measures accelerated game time.

At every step: (1) deliver due inbound messages in timestamp then ID order; (2) apply queued player actions; (3) reserve protected support; (4) run current chapter rates; (5) commit material transactions; (6) evaluate milestone events; (7) pause if a decision is queued; (8) validate transition guards and snapshot. If multiple thresholds are crossed, queue each once in threshold order. A UI render must never perform a game mutation.

Use fixed-point integer arithmetic for work and scores. Carry multiplication/division residue so ten 100 ms ticks equal one second. Rates expressed as decimals in JSON must be parsed into integer milli-units. Use BigInt for every mass calculation; round only formatting. Display enormous quantities in scientific notation with an inspectable exact value.

`Advance to next event` is permitted only when no unresolved choice exists. Fast-forward in bounded fixed-step chunks until a milestone, message, resource bottleneck or chapter guard appears. Yield to the browser every 20 ms and support cancellation. Do not jump past a destruction prompt or run years of hidden progress while the player is away.

## Chapter-specific contracts and edge cases

### 01 Office

Keep the original production prices and rates. Cooldown applies across mouse, touch and keyboard; ignore key repeat. Cap lifetime gain at 3,000 for the chapter. Preserve all material remainders and anchors. Require explicit lease acceptance to proceed. Existing v1 office saves cannot prove full physical history; import their flags, reconstruct the uniquely implied wire use and spent-upgrade mass, then display an import summary. Keep the old save unchanged. Reject inconsistent v1 saves instead of guessing.

### 02 Building

Contract work resets after each of the three ordered jobs, but cumulative building work remains in the summary. A permit is awarded once per completed contract. The maintenance charter is free after contract three. Heat is clamped to [0,100]; cooling runs when production is stopped. Throttle uses hysteresis (80 on, 50 off). Wire draw raises drawing from 1 to 4; the dispatch station then becomes the bottleneck. Freight scheduling raises dispatch from 2 to 4, exposing the bender limit of 3. At throttled maximum output, heat gain is 0.75 × 0.8 = 0.6, below base cooling 0.8, so automatic recovery is possible. All route and station effects apply only to future work. Courtyard loss occurs only at direct-route construction, not when hovering it.

### 03 City

Allocation components are nonnegative integers totaling ten. Reject an invalid slider update atomically; moving one unit transfers it from a chosen donor. Service scores are [0,100]. Stable-service seconds reset to zero whenever any district falls below 90. The safety throttle restores the disclosed safe allocation if safeguards are enabled; it pauses reserve certification but never disables services. A permitted demand reduction chooses a different district each time. Reserve is a certification work counter, not physical clip mass.

### 04 Preservation

Each case consumes verification work once. Completing a case commits the previewed treatment, debits any archive capital and changes the correct anchor. An archive requires allocating 1/10 of original material to storage capital; a reconstruction 1/100; the rest becomes raw. This is an authored compression model, not a claim about consciousness. Original leaves the mass untouched. A later lossless copy cannot restore an earlier approximate reconstruction. Living cases cannot use archive or reconstruction recipes.

Original office choice includes equipment and room but excludes the separately tracked photograph. If an earlier action already removed an original (for example the loading-route garden), its case offers an Already absent audit outcome; it cannot be restored by selecting Original. This still counts as a resolved case and has zero new overhead. The six cases' maximum overhead is 5×3 + 6 = 21; support capacity 24 leaves an all-original route. `Relocate` preserves living and protection flags, charges work 30 and moves the habitat account; it never transforms living matter into a recording. Living support is reserved before all production.

### 05 Solar

Orbital work increments cumulative and spendable work. Projects consume spendable work only; thresholds use cumulative work. Every seed reserves a material kit from solar raw before accepting its 30-work job. The minimum protected support slot is non-negotiable. Deferred stellar extraction reduces ordinary output by 10 percent but can still reach every milestone; habitat relocation costs 30 spendable work and removes that reduction after its existing protection is transferred.

At a valid default allocation with maximum protected overhead: net power = 12 − 2 − 1.05 = 8.95; output = min(4.475,6,6) = 4.475 work/sec before any 10 percent deferral. This proves positive flow, not campaign pacing. Each seed kit reserves 10^15 micrograms. Keep a supported habitat independent of the star before any final stellar dismantling.

### 06 Remote offices

The six regions include origin. Count origin’s local startup receipt as the first of six initial receipts. Start origin settled with three kits from Act 5 and its local policy set to steward. The initial three kits cover the two origin branches and one replacement. A region's 60-work reproduction threshold enables a repeatable kit-build action costing 60 local work and local kit material; do not confuse threshold work with inexhaustible free children. Origin can also rebuild a kit. Only one unacknowledged launch may target a given unsettled region.

Survey an edge before launch: 10 seconds of local work, no mass cost. Travel takes two one-way delays; the first receipt takes one further delay. A policy is frozen into the seed at launch. Central changes generate new scheduled messages; they never mutate a remote node immediately. Authoritative simulation state may know a settlement exists while the UI correctly shows Awaiting receipt. A message or command carries an immutable unique ID and policy version.

The C fork is a scheduled report on first acknowledgement. Ratify sets protected=true. Supersede sends a versioned amendment and resolves only on its receipt; no live habitat is consumed in this act. Existing living protection still requires explicit release in Act 7. If a child fails for a deterministic authored reason, offer a visible recover-kit action costing 10 local work, with a return delay. Random failures are disabled in v1.

### 07 Cosmic inventory

At entry, coalesce previously certified nonprotected raw sources into their existing ledger accounts; preserve all clips, capital, protections and message ownership. Split the remaining unreached allocation into eight exact cells with the final cell receiving division remainder. Coverage is knowledge, not matter, and grants no metal by itself.

Survey work earns project work while assigned; project spending does not erase measured coverage. Recovery work likewise supplies its project budget. Reserve protected accounts and capital outside the ordinary-cell target. Exotic cells 6 and 7 may be surveyed before matter coupling but cannot be recovered until it is complete. The six other cells provide more than enough recovery work for the 60-work coupling project. Topology closure can be completed from early survey work.

Recovery of a cell distributes its starting mass over exactly 100 work units. Each unit removes a precise share, with the final unit taking the residue. Default destination is clips plus declared radiation, not a magical UI count. All remaining nonprotected scraps and earlier capital except the explicitly listed terminal machine must also be swept by the terminal audit. The audit is a real query across the ledger, never a prewritten “100%” string.

Protected releases enumerate originals, archives and living reserves separately. No checkbox is preselected. Require a general terminal authorization only after each relevant decision is resolved. `Hold the remainder` produces a holding epilogue and does not satisfy the totality guard. The terminal machine remains represented by a retained capital account of 1,000,000,000,000 micrograms, allocated from existing capital; it includes its controller, mechanism and any retained physical office anchors. If the office was archived or reconstructed, its final view retains that label. If insufficient capital remains, transfer the shortfall from eligible raw BEFORE clearing that source.

### 08 Last desk

Charge terminal energy to 100 over 30 seconds using retained power hardware already in the terminal account. This is a one-time abstract readiness process; charge cannot fund other operations. Once charged, build the dependency schedule with five ordered tasks. Present their ledger deltas and costs before commitment. Archive closure is not offered until its releases are complete.

Upon commitment, play a 45-second sequence at default speed: five tasks at 0, 8, 18, 28 and 38 seconds; end exterior at 45. Pause and accessibility controls are out of world. The precommit checkpoint is immutable. Task costs are 10,15,15,20,30; final passive release accounts for the remaining 10 energy units. Each task converts its named capital share to clips and declared radiation; shares in JSON sum to the complete terminal machine. No duplicate completion after a reload.

The final sentence is displayed or replayed BEFORE main compute retirement at 28 seconds. After that moment there is no new diegetic text. The final controller retires at 38 seconds and the remaining exterior is an out-of-world presentation. The game application can display credits; it is not an uncounted character in the universe.

## Persistence and migration

Save version 2 JSON under `after-hours.campaign.v2`. Save every five seconds, on choices, completed transactions, message deliveries, transitions, visibility loss and before terminal commitment. Also retain one rolling previous-valid snapshot and named chapter-entry/predecision checkpoints. Export/import a save file locally; no cloud account is needed.

Store BigInts as tagged decimal strings or schema-known decimal-string fields. Validate ID membership, safe integer times, bounds, unique transaction/message IDs, prerequisite order, released-protection consistency and the conservation invariant before loading. Future schema versions and corrupt saves are preserved untouched with a clear recovery choice. Storage failure leaves a playable in-memory game and a visible save-status message.

Use one active writer. Detect a newer revision via the storage event, pause writes and ask the user to reload or export the local snapshot. Never merge two timelines by adding their clips. Resuming a terminal save applies only tasks whose transaction IDs have not committed, using stored elapsed sequence time.

## UI components and assets

Suggested modules: `game/types`, `ledger`, `transactions`, `clock`, `events`, `save`, `chapters/01..08`, `content`, `selectors`; `ui/Shell`, `MetricRail`, `ChapterScene`, `DecisionDialog`, `EvidenceViewer`, `Ledger`, `MessageQueue`, `CheckpointMenu`. Use semantic DOM for controls and a small SVG for maps. Share the shell, not the chapter's verbs.

Art plates are high-resolution composition and mood references. Implement separate object layers or SVG overlays for cabinet, lamp, frame and later protected features. Do not crop one flat concept painting and claim every saved variant is supported. Scenery may simplify to a polished 2D tableau while rules remain complete. Always label archived or reconstructed office views.

## Acceptance tests that protect the design

- All-original/no-salvage and maximum-efficiency paths both reach the last authorization without a deadlock.
- Conservation holds after every material transaction; current clips decrease on reinvestment while lifetime output does not.
- One gram cannot count as both archive capital and clips. Every transit kit belongs to one location/account.
- Every irreversible event pauses, names its subject and effect, and creates a checkpoint.
- A recorded person is not a living person; a reconstructed image never restores original fidelity.
- Protected support is reserved before power allocation. Default solar flow is positive at overhead 21.
- Remote revisions apply at arrival, and only appear as confirmed after receipt. Duplicate delivery is idempotent.
- Surveying does not create matter. Exotic recovery requires its fictional project. No project requires its own output to unlock.
- Totality cannot pass with raw, protected, in-transit or capital matter remaining; rounding cannot create a false zero.
- Terminal energy costs fit 100; tasks obey dependency order; final dialogue precedes retirement of compute.
- Save/load at each chapter boundary, before each confirmation and after each terminal task reproduces the same state.
- Keyboard, reduced motion, 360 px layouts and readable scenery-independent UI work throughout the arc.

## What not to infer from this handoff

Do not make claims about the capabilities or availability of the user's chosen implementation model. Do not assume physically accurate SI energy simulation, a commercial production estimate, validated balance, executable game code or final cutout assets have already been supplied. The blueprint is complete at the gameplay/rules level; implementation and playtesting remain work to do.
