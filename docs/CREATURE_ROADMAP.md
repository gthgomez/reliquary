# Hollowmere: creature and world ideas

This is a design backlog, not a claim that these features exist. It builds on the current Pactwarden premise, three starter lines, 21 current species, the level-16/32 evolutions, four-beast party, storage, elemental combat and Hollowmere locations. Costs, names, odds and story details below are proposals for playtesting. The immediate priority is the QA ledger and a reliable core loop.

## Six concepts worth prototyping

### 1. A pact nursery, eggs and hatching

Let the player entrust two compatible, consenting companions to a keeper in the Binding Grove. An egg is a new creature, never a replacement or deletion of either parent. Start with a few hand-authored family groups: for example, Emberkit's fox-drake line, Mirewhelp's river-newt line and Briarling's thorn-sprite line. Give the player a clear preview of the possible family and costs before confirming; prevent a full storage box from consuming resources without producing an egg. A single-parent rescue egg from an NPC can introduce the mechanic without making breeding mandatory.

Track incubation in steps taken while the egg is carried, with a visible progress band and a reasonable cap on carried eggs. Steps should be counted from committed movement, not frames, so browser refresh rates, tab throttling and teleporting cannot accelerate it. A portable incubator can hold one egg; a nursery can hold extras. Allow a player to pause, cancel and pick an existing egg back up without losing progress. Hatch in a safe world state, with a readable reveal and explicit party-versus-storage destination; defer the event during battle, menus and dialogue.

Persist explicit egg IDs, family, parents, inherited attributes, progress and version, rather than encoding metadata in unrelated flags. Decide migration and older-client behavior before shipping: older strict saves reject unknown content, so a downgrade must warn and preserve an untouched backup. Validate parent IDs, mutually exclusive slots, duplicate IDs, invalid species and full-party/full-box cases. Test save/reload at every boundary, interrupted writes, repeated hatch events and long idling; run large-box and hatch-animation frame checks. Avoid real-money timers, mandatory waiting or power that makes caught creatures obsolete.

### 2. Heredity without a mandatory optimization treadmill

Inherit one visible trait from each parent, with a small bounded random variation for the remaining traits. Show broad ranges before breeding and exact inherited traits after hatching; no hidden guarantee that encourages infinite rerolls. Temperament could influence the starting move or field behavior rather than silently dominating every stat. Move inheritance should use an explicit allowlist so no offspring learns invalid or impossible skills; keep the existing four-skill limit and present a choice when full.

Use family-based lineage records rather than simulating genetics for every pairing. Avoid inbreeding complexity in the first version; a same-family compatibility rule plus a clear "no result" preview is easier to understand and maintain than opaque percentages. Consider adoption and egg rescue as equal paths for players who prefer not to breed. Acceptance: deterministic seeded tests for parents and skills, no invalid moves, bounded stats, no duplicated UIDs, and no unannounced loss of a parent's nickname, inventory or party position. Balance with caught, gift and bred beasts at the same level.

### 3. Branching and special evolutions

Keep the existing level-based Emberkit → Pyrefox → Crownwyrm, Mirewhelp → Riverguard → Tidemark, and Briarling → Thornback → Elderbramble paths. Add one optional branch at a time as a player-confirmed choice, not an irreversible surprise. Examples: a Mirewhelp raised by Mirefen's tide shrine might develop a protective marsh form; a Briarling that aids the Grove may become a light/verdant guardian; a Pyrefox that keeps the Ashenbarrow lantern lit could gain a defensive ash form.

Preview appearance, element changes, stat direction, available moves and whether the decision is reversible. Let players defer an evolution and revisit it at a shrine; always retain the current species until the choice is confirmed. Save pending choices atomically with the creature and test cancellation, disconnect, reload, evolution at a full move list and multiple thresholds crossed in one lore award. Content validation should catch cycles, missing assets, unavailable conditions and incompatible save versions. Design every form to offer a role rather than just larger numbers, then test its impact against Cael and wild encounters.

### 4. Raising, trust and creature care

Build on party management and practice with a small camp at safe locations. Offer one short, optional interaction per companion—groom, play, rest or study—and tell the player which outcome it affects. Trust can initially unlock dialogue and a cosmetic field pose; keep combat bonuses modest, bounded and clearly shown. A tired or fainted creature should not lose trust merely because a player paused, lost connectivity or used accessibility settings. Avoid real-time decay and manipulative daily streaks.

Use a small number of durable states instead of a constantly updating simulation. Award progress at discrete completed actions and save transactionally. If a player ignores camp, the main story remains viable. Test interactions at max trust, storage transfers, battle interruption, offline time and save restore. Player research should include both people who want attachment and people who want fast battles; track whether the feature creates meaningful choices or chores.

### 5. Ecology-led exploration and cooperative field abilities

Give existing elements modest field uses that open shortcuts or optional discoveries without requiring a rare creature. Mirewhelp can reveal river currents; Briarling can identify safe hedges; Mothwisp can light a crypt; Pebblet can read unstable stone. Offer at least one alternate item, NPC service or route to each critical path. Use map-specific authored interaction points first: this prevents every tile from running a complex simulation and makes solutions legible.

Teach abilities through a nearby landmark and an NPC hint, preview requirements before committing, and provide a journal clue after discovery. QA every ability with no matching creature, a stored creature, a fainted creature, repeat activation and save/reload. Protect collision and warp geometry; ensure route completion remains possible before and after every optional evolution.

### 6. A living compendium and relationship stories

Expand the existing Reliquary from a seen/caught grid into entries that record observations earned through play: habitat, elemental hints, an authored tale, a discovered field ability and known evolution clues. A trail clue could connect Gravepup to a lost lantern in Ashenbarrow, or Fenwitch to the Mirefen reedcutter's warning. Mark facts as discovered and leave unknowns clearly unknown; do not disclose a rare species' entire solution the first time it appears.

Build one short, completable quest per region before attempting procedurally generated stories. Give each an objective, a visible journal entry, an optional creature-specific approach and a non-creature-specific alternative, plus recovery after leaving/reloading. Keep quest state versioned and minimize permanent missables. Test text length, screen-reader order, color-independent markers, no-party and post-victory access. Measure whether quests improve direction and attachment without turning the world into a checklist.

## Candidate ideas by perspective

### Creature collectors and breeders

1. **Family albums:** show parents and offspring as a simple tree with unknown links; never expose another player's private save.
2. **Rescue eggs:** find an abandoned egg during a Grove quest; offer the same outcomes as nursery breeding.
3. **Seasonal shells:** use biome-themed shell patterns as cosmetics, with no exclusive stat advantage.
4. **Hatchling temperaments:** a calm hatchling learns one defensive option while a fierce one learns an offensive option; disclose the tradeoff.
5. **Inherited keepsakes:** pass a non-consumable visual trinket down a family line, with a clear ownership limit.
6. **Cross-family adoption:** two different species mentor an unrelated egg; inherit a cosmetic behavior rather than inventing hundreds of hybrids.
7. **Egg observation:** track rocking, sounds and cracks as progress cues, with text alternatives and reduced-motion support.
8. **Nursery requests:** an NPC asks for an egg from a broad family, with no rare-IV requirement and no forced surrender of a favorite creature.
9. **Breeding journal:** show discovered compatibility rules and missing information without exposing all combinations.
10. **Lineage challenge:** complete optional encounters with relatives in the same party; award lore or cosmetics, not mandatory progression.

### Evolution and creature identity

11. **Bond form:** a branching form unlocked by a completed care quest, with a visible alternative to pure level grinding.
12. **Biome forms:** Fen, Ash and Grove variants change one elemental weakness and one field interaction.
13. **Shrine attunement:** choose a defensive or offensive evolution at a shrine, with a clear preview and confirmation.
14. **Deferred evolution:** store an available evolution as a party-card prompt until the player chooses it.
15. **Temporary resonance:** a once-per-battle transformation lasts a fixed number of turns and uses a visible cooldown.
16. **Dual-companion evolution quest:** two unrelated beasts cooperate in a puzzle; neither is consumed.
17. **Veteran forms:** a cosmetic scar, flower or lantern appears after authored milestones; allow toggling it off.
18. **Move memory:** relearn previously learned moves at a Grove tutor, replacing one of four with explicit confirmation.
19. **Evolution stories:** each starter's final evolution has a short regional scene that explains its place in Hollowmere.
20. **Form comparison:** compare before/after stats, elements, skills and field effects before any irreversible choice.

### Combat and strategic players

21. **Status glossary:** explain burn, soak, bind, daze, ward and bless at the moment a player first encounters each.
22. **Predictable enemy intent:** telegraph a dangerous charge or heal, while keeping ordinary actions uncertain.
23. **Element feedback:** add text and a distinct icon for effective/resisted hits, independent of color and sound.
24. **Skill replacement choice:** choose which existing skill to forget, decline learning, or revisit the decision at a tutor.
25. **Practice sparring:** a free, nonlethal training encounter teaches switch, item and bind rules without permanently consuming items.
26. **Warden rematches:** offer Cael teams with known level bands and visible rewards after the first victory.
27. **Companion roles:** defensive, support and speed-oriented skills make a four-member party useful without mandatory optimal IVs.
28. **Encounter variety:** introduce authored wild pairs or terrain modifiers only after single-foe balance and UI are sound.
29. **Combat recap:** optionally review the last several log entries, including missed attacks and status changes.
30. **Battle accessibility:** remappable controls, readable hit feedback, reduced flashing and a battle speed setting that preserves timings and outcomes.

### Exploration and world building

31. **Briar Road tracks:** footprints hint at an encounter family and lead to a short optional scene.
32. **Mirefen water levels:** switch between two authored map states at a safe rest point; never strand the player.
33. **Ashenbarrow lanterns:** light crypts to reveal optional lore and keep a non-Mothwisp fallback available.
34. **Thornkeep notice board:** three short rotating NPC requests drawn from a curated list, with no daily expiry.
35. **Grove sanctuary:** display a few stored companions in static poses; cap visible creatures to protect frame time.
36. **Weather flavor:** rain or fog alters ambience and optional clues, with reduced-effects mode and no critical color-only signals.
37. **Roadside camps:** heal or save at marked locations, balanced against existing free shrines and paid inns.
38. **Shortcut restoration:** repair a fallen bridge after a local quest, reducing repeat travel without skipping story gates.
39. **Living signs:** update road signs with destinations already visited and last-known objective hints.
40. **Lost-and-found:** a villager returns a misplaced keepsake after a small search; avoid inventory dead ends.

### Story and role-playing

41. **Pact conversations:** each starter has two early conversations responding to the player's actions, with no personality penalty.
42. **Maren's ledger:** reveal short historical entries about the Crown as players finish region quests.
43. **Cael's apprentices:** friendly optional challengers teach switching, status and items before the Warden fight.
44. **Reedcutter follow-up:** investigate Fenwitch sightings with peaceful and battle approaches.
45. **Gravepup's lantern:** return a missing light to Ashenbarrow and earn a cosmetic companion pose.
46. **Innkeeper stories:** rest reveals one local rumor, clearly separated from the paid-rest confirmation.
47. **Companion preferences:** creatures respond differently to camps or habitats without locking progression behind hidden meters.
48. **Pactwarden reputation:** record completed community favors as narrative flags; avoid punishing players for taking different routes.
49. **Post-Cael road:** unlock a short expedition west of the ash with an explicit end-of-prototype notice.
50. **Mercy choices:** allow selected encounters to resolve through healing or offering an item, with comparable rewards.

### Quality of life, fairness and performance

51. **Named save slots:** show location, party and timestamp; confirm overwrite and preserve a recoverable backup.
52. **Export/import:** provide a validated local backup with version and clear error messages, without requiring an account.
53. **Safe box search:** filter by name, element and role; virtualize only after measurement shows it is needed.
54. **Party comparison:** display stat and elemental strengths side by side with text labels and keyboard access.
55. **Targeted items:** choose any eligible creature, preview the effect and avoid consuming no-op items.
56. **Optional encounter pacing:** accessible repel controls with clear remaining steps and no effect on scripted fights.
57. **Objective recap:** present the current story clue and last place visited without spoiling optional discoveries.
58. **Control profiles:** remap keyboard/controller and keep touch buttons resizable within safe screen areas.
59. **Photo mode:** pause simulation, hide UI and capture a local image without exporting a save or user data.
60. **Performance presets:** offer reduced particles, audio and motion independently; measure each preset on real devices before making it a default.
61. **Frame-time overlay:** a developer-only display shows frame time, p95, long tasks and scene name without collecting player telemetry.
62. **Automated journey seeds:** deterministic encounter streams cover victory, capture, full storage, loss and forced switching in CI.
63. **Asset failure notices:** show a recoverable message for missing required sprites while retaining a readable fallback.
64. **Offline play audit:** verify that a fresh service worker, cached assets, saves and upgrade paths really work before advertising offline support.
65. **Low-vision mode:** provide scalable text, high-contrast UI and non-color element labels, verified at 200% zoom.
66. **Gentle onboarding:** give a replayable, skippable lesson on healing, saving and binding after the first pact.

## Sequencing and acceptance

First finish save reliability, item targeting, input access, battle correctness and a real-device performance baseline. Next prototype the nursery using a single authored egg and explicit migration tests; validate that hatching is enjoyable before expanding inheritance. Then add one special evolution and one region quest, collecting player feedback on clarity and balance. Only after those slices work should the project multiply forms, family combinations or live-world systems. Keep cosmetic variants optional, preserve player agency, and budget transition/animation work against frame-time measurements.
