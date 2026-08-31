# Content system

Species, skills, items, encounters, and maps are data-driven in
`src/game/content.ts` and `src/game/maps.ts`. Run `npm run validate:content`
after changing IDs or content. CI runs this gate as well as the gameplay tests.

The validator checks unique IDs, legal numeric ranges, known element/skill/item
references, learnset levels, evolution targets, rectangular maps, walkable
spawns and warp endpoints, encounter ranges, and positive encounter weights.

Save validation uses the same content registries, so a save cannot introduce an
unknown species, skill, item, or map coordinate into the runtime.
