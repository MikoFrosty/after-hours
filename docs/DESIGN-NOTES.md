# Implementation notes

This file records how the implementation reads the manifesto, `IMPLEMENTATION-SPEC.md`, `campaign.json` and `NARRATIVE.md`, and what was decided where they were silent. Nothing here changes a stated rule; where a rule needed an interpretation, the interpretation is named so it can be revisited after playtesting.

## Authority order

Manifesto (fiction, arc, meaning) → implementation spec (simulation, accounting, edge cases) → `campaign.json` (numbers) → narrative (exact copy). Concept plates are used as backdrops; state that must be accurate (office objects, the garden, fidelity) is drawn as SVG layers from the save, never inferred from a painting.

## Ledger interpretation

- **Account categories** are exactly the eight in the spec. Each account also carries a `kind` so the terminal audit can enumerate *originals*, *records*, *reconstructions* and *living reserves* separately.
- **Protected originals** (cabinet, lamp, frame, photograph, garden, square, mural, correspondence) live in `archiveProtected` with `kind: original`. The category name is read as "preservation-protected material", covering both retained originals and archive storage.
- **Office equipment** (desk, terminal, machine, room fixtures) is `capital`. Choosing *Original* for the office case in Act 4 marks it protected; archiving it moves 1/10 to archive storage and the rest to raw.
- **Authored masses** not given by the spec (all fictional): night garden 2 t; public square 5 kt; school mural 3 t; civic correspondence 500 kg; living habitat 10¹⁸ µg; the world below region C 6 × 10³³ µg; each Act 5 construction project 10²⁷ µg. They are carved out of the chapter's disclosed grant, never added to it.
- **Lifetime production** counts every clip formed, including salvage yields (the office economy counts salvage toward the 3,000 order). If salvage would exceed the order, only the remaining quota forms clips; the rest is raw scrap.
- **Transactions** are atomic and validated (input exists, protection permits it, outputs including radiation equal input). Discrete transactions are de-duplicated by ID; per-step production batches are deterministic within the step and are not stored individually.

## Chapter decisions

**01.** Salvage requires a named confirmation and creates a predecision checkpoint. The three Mara messages are dated before 11:47 PM: they were left, not sent.

**02.** The route starts on the courtyard. *Build* on the direct route is the only way to clear the garden and is the moment of loss. The building upgrades are permit-only (no mass). Every contract pauses for a one-button inspection.

**03.** Allocation moves one unit at a time between a district and industry (industry is the donor for `+`, the recipient for `−`). The consultation decision is asked on the first full service. Resident vignettes appear only while every district is at 80+, as feedback that is not consumption. The mandate appears only after 30 s of stable service at 90+ and reserve 300.

**04.** A case's treatment is chosen, then *committed to verification* (with the preservation certificate for archive/reconstruction/relocation). Opening a case for the first time pauses play so its evidence can be read. After three cases the habitat tender opens and parallel review allows two cases at once within the same ten slots. The spec's "decisions replace expansion" is honoured with a small background surplus whose rate is `(24 − overhead) × 0.1` work/s, so protected support visibly narrows later output without ever blocking progress. The independent witness (earned by keeping public consultation) shows original evidence beside every certificate and contributes a letter.

**05.** The star decision is asked when the extraction study completes. *Defer* keeps the sky and applies ×0.90. *Relocate* applies ×0.90 until the 30-work relocation moves the habitat account, with its living and protected flags, to a powered shell; the *sky* anchor then becomes absent.

**06.** Orders to remote regions are messages: they arrive after the region's shortest-path delay and execute there (survey 10 s → assemble a kit from 60 local work if none is in stock → launch with the policy frozen into the seed). Only messages the central office itself sent are drawn in flight; inbound evidence is invisible until it arrives. The spec's "deterministic authored reason" for a failed child is used once: the first seed toward region B loses guidance, stays on the ledger in transit, and can be recovered for 10 origin work with a return delay. The sky-survey charter is offered only when no kit is adrift, so every transit kit belongs to exactly one account before Act 7. *Ratify* halves region C's local rate. *Supersede* resolves only when the amendment's receipt returns; the living account stays protected until Act 7's explicit release.

**07.** Survey slots move to recovery automatically when a cell completes (or are freed when an exotic cell still needs matter coupling). The terminal audit is a query over every ledger account with non-clip mass. Authorization assembles the 1,000 kg terminal machine first from the retained office items (so the last desk is literally the machine that unmakes itself), then from other capital, then from raw, and only then sweeps everything else to clips.

**08.** The five tasks run at 0, 8, 18, 28 and 38 s of a 45 s precommitted sequence. Captions appear only before main compute retires; the final sentence is shown from 20 s to its retirement at 28 s; afterwards there is no new in-world text. The exterior shot uses a crop of plate 7 without the terrarium (which would contradict a liquidated living reserve), then silence, then credits with the ordinary out-of-world actions and no grade.

## Presentation choices

- The rail shows exactly four headline items: clips on hand, one chapter metric, bottleneck, charter; plus the story clock and pace controls.
- Story time is a presentation scale (hover the clock to inspect it): 1 s = 1 story minute in the office, 12 hours in the building, 20 days in the city, a year in preservation, 5,000 years in the solar era, 10⁷ years across distant offices, 10¹⁰ years in the cosmic inventory.
- Act 4 art desaturates a little with every non-original outcome; Act 7 art darkens as cells are cleared. Act 4 music loses one channel per replaced original.
- Office variants: *archived* renders as a phosphor wireframe recording; *reconstructed* drops small details (notes, calendar, rain, the photograph's image); *last observation* is a still, darkened frame. Labels are always shown.

## Pacing

On automated play the seeds give roughly 27 minutes of simulated time at 1× (office ≈ 6, building ≈ 3, city ≈ 5, preservation ≈ 2, solar ≈ 2, distant offices ≈ 5, inventory ≈ 3, last desk ≈ 1.5), before reading and deciding. That is shorter than the manifesto's 90–150 minute hypothesis for chapters 4 and 5 in particular. The seeds were kept as given; the manifesto asks for tuning after observation rather than by adding currencies.

## Not implemented / open questions

- The original three chapter-one report variants were not supplied; three short factual variants were authored (all kept, some salvaged, all salvaged).
- The v1 office save format was not supplied; the importer accepts `{ version: 1, available, lifetime, upgrades, salvaged }`, reconstructs the uniquely implied wire use and machine mass, and rejects anything inconsistent.
- Background production of certified earlier chapters is summarized rather than simulated (their mass stays in their accounts until the terminal audit).
