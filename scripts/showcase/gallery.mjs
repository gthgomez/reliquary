// Regenerate the artwork gallery from the game's canonical content registry.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SPECIES, ELEMENTS } from "../../src/game/content.ts";

const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const species = Object.values(SPECIES);
const card = (sp) => `<td align="center"><img src="../../public/game/sprites/${sp.id}.png" alt="${escape(sp.name)} creature artwork" width="144"><br><strong>${escape(sp.name)}</strong><br>${escape(sp.epithet)}<br>${sp.elements.map((id) => escape(ELEMENTS[id].name)).join(" · ")}<p>${escape(sp.description)}</p></td>`;
const rows = [];
for (let i = 0; i < species.length; i += 2) {
  rows.push(`<tr>\n${species.slice(i, i + 2).map(card).join("\n")}\n${i + 1 === species.length ? "<td></td>\n" : ""}</tr>`);
}
const text = `# Creatures of Hollowmere

[Back to Reliquary](../../README.md) · [Gameplay and capture notes](README.md)

${species.length} creatures from the current prototype. These are **existing shipped creature
artwork**, not gameplay screenshots or newly generated art. Names, epithets,
elements and lore come directly from [the game content](../../src/game/content.ts).
Some forms require progression; this gallery does not claim the opening demo
unlocks every creature.

<table>
${rows.join("\n")}
</table>

Regenerate with \`node --experimental-strip-types scripts/showcase/gallery.mjs\`.

Copyright © 2026 Jonathan Gomez Aguilar. All rights reserved. The repository's
[proprietary license](../../LICENSE) applies. Source/authorship records for the
art remain unresolved as documented in [asset provenance](../ASSET_PROVENANCE.md).
Only existing browser-ready runtime PNGs are referenced here; private source
masters are not included.
`;
const directory = fileURLToPath(new URL("../../docs/showcase/", import.meta.url));
mkdirSync(directory, { recursive: true });
writeFileSync(`${directory}CREATURES.md`, text);
console.log(`Generated ${species.length} canonical creature cards.`);
