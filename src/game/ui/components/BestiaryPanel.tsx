import { useState } from "react";
import { ELEMENTS, MAX_LEVEL, SKILLS, SPECIES } from "../../content";
import { MAPS } from "../../maps";
import {
  analyzeEvolutionGraph,
  CATEGORY_LABELS,
  elementMatchups,
  speciesHabitats,
} from "../../systems/species-progression";
import {
  discoveryKnowledgeLevel,
  formatSizeCm,
  formatWeightKg,
} from "../../systems/morphology";
import type { ElementId, Snapshot } from "../../types";
import {
  ElementCrests,
  FiligreeSurface,
  PortraitCrest,
  ReliquaryBadge,
  StatChartBar,
} from "./ReliquaryPrimitives";

const PROGRESSION_ENTRIES = analyzeEvolutionGraph(SPECIES, MAX_LEVEL).entries;

type FilterKind =
  | "all"
  | "bound"
  | "spotted"
  | "undiscovered"
  | "three_stage"
  | "two_stage"
  | "single_stage"
  | "variant"
  | "exceptional";

type SortKind = "number" | "name" | "element" | "status";

export function BestiaryPanel({
  snap,
  initialSpeciesId,
  returnLabel,
  onReturn,
}: {
  snap: Snapshot;
  onClose?: () => void;
  initialSpeciesId?: string | null;
  returnLabel?: string | null;
  onReturn?: () => void;
}) {
  const allSpecies = Object.values(SPECIES).sort((a, b) => a.collectionNumber - b.collectionNumber);
  const firstKnown =
    (initialSpeciesId &&
      discoveryKnowledgeLevel(initialSpeciesId, snap.seen, snap.caught, snap.records, SPECIES[initialSpeciesId]) !== "undiscovered"
      ? initialSpeciesId
      : null) ??
    allSpecies.find((sp) => discoveryKnowledgeLevel(sp.id, snap.seen, snap.caught, snap.records, sp) !== "undiscovered")?.id ??
    null;

  const [selectedId, setSelectedId] = useState<string | null>(firstKnown);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [elementFilter, setElementFilter] = useState<ElementId | "all">("all");
  const [sort, setSort] = useState<SortKind>("number");
  const [pageView, setPageView] = useState<"split" | "entry">(initialSpeciesId ? "entry" : "split");

  const activeId =
    selectedId &&
    discoveryKnowledgeLevel(selectedId, snap.seen, snap.caught, snap.records, SPECIES[selectedId]) !== "undiscovered"
      ? selectedId
      : firstKnown;

  const activeSp = activeId ? SPECIES[activeId] : null;
  const activeProg = activeId ? PROGRESSION_ENTRIES[activeId] : null;
  const activeKnowledge = activeSp
    ? discoveryKnowledgeLevel(activeSp.id, snap.seen, snap.caught, snap.records, activeSp)
    : "undiscovered";
  const activeRecord = activeSp ? snap.records[activeSp.id] : undefined;
  const observedHabitats = activeSp ? (snap.habitats[activeSp.id] ?? []) : [];
  const theoreticalHabitats = activeSp ? speciesHabitats(activeSp.id, MAPS) : [];
  const activeMatchups = activeSp ? elementMatchups(activeSp.elements) : null;

  const boundCount = allSpecies.filter((sp) => Boolean(snap.caught[sp.id])).length;
  const progressPct = allSpecies.length ? Math.round((boundCount / allSpecies.length) * 100) : 0;

  const filteredSpecies = allSpecies
    .filter((sp) => {
      const k = discoveryKnowledgeLevel(sp.id, snap.seen, snap.caught, snap.records, sp);
      const prog = PROGRESSION_ENTRIES[sp.id];
      if (filter === "bound" && k !== "full") return false;
      if (filter === "spotted" && k !== "encountered") return false;
      if (filter === "undiscovered" && k !== "undiscovered") return false;
      if (filter === "three_stage" && !prog?.category.startsWith("three_stage")) return false;
      if (filter === "two_stage" && !prog?.category.startsWith("two_stage")) return false;
      if (filter === "single_stage" && prog?.category !== "single_stage") return false;
      if (filter === "variant" && prog?.category !== "variant") return false;
      if (filter === "exceptional" && prog?.category !== "exceptional") return false;
      if (elementFilter !== "all") {
        if (k === "undiscovered" || !sp.elements.includes(elementFilter)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const ka = discoveryKnowledgeLevel(a.id, snap.seen, snap.caught, snap.records, a);
      const kb = discoveryKnowledgeLevel(b.id, snap.seen, snap.caught, snap.records, b);
      if (sort === "name") {
        const na = ka === "undiscovered" ? `~${a.collectionNumber}` : a.name;
        const nb = kb === "undiscovered" ? `~${b.collectionNumber}` : b.name;
        return na.localeCompare(nb);
      }
      if (sort === "element") {
        const ea = ka === "undiscovered" ? "~" : (a.elements[0] ?? "~");
        const eb = kb === "undiscovered" ? "~" : (b.elements[0] ?? "~");
        return ea.localeCompare(eb) || a.collectionNumber - b.collectionNumber;
      }
      if (sort === "status") {
        const rank = { full: 0, encountered: 1, undiscovered: 2 };
        return rank[ka] - rank[kb] || a.collectionNumber - b.collectionNumber;
      }
      return a.collectionNumber - b.collectionNumber;
    });

  const handleSelect = (id: string, openEntry = false) => {
    setSelectedId(id);
    if (openEntry) setPageView("entry");
  };

  return (
    <>
      <div className="rq-bestiary-progress" aria-label={`Collection progress ${boundCount} of ${allSpecies.length} bound`}>
        <div className="rq-progress-track">
          <div className="rq-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        {onReturn && returnLabel ? (
          <button type="button" className="btn-ghost rq-breadcrumb-btn" onClick={onReturn}>
            ← {returnLabel}
          </button>
        ) : null}
      </div>

      {pageView === "entry" && activeSp ? (
        <div className="rq-entry-toolbar">
          <button type="button" className="btn-ghost" onClick={() => setPageView("split")}>
            ← Back to Entry Grid
          </button>
        </div>
      ) : null}

      {activeSp && activeProg ? (
        <FiligreeSurface className="reliq-detail rq-bestiary-entry">
          <section aria-label={`${activeSp.name} lore and progression`}>
            <div className="rq-entry-hero">
              <PortraitCrest
                speciesId={activeSp.id}
                alt={activeKnowledge === "encountered" ? `${activeSp.name} silhouette` : activeSp.name}
                silhouette={activeKnowledge === "encountered"}
                size="lg"
              />
              <div className="rq-entry-meta">
                <div className="reliq-detail-head">
                  <span className="rq-num">#{String(activeSp.collectionNumber).padStart(3, "0")}</span>
                  <strong>{activeSp.name}</strong>
                  <ReliquaryBadge tone={activeKnowledge === "full" ? "gold" : "bronze"}>
                    {activeKnowledge === "full" ? "Bound Record" : "Field Sighting"}
                  </ReliquaryBadge>
                  <ReliquaryBadge tone="emerald">{activeSp.combatRole}</ReliquaryBadge>
                </div>
                <p className="rq-epithet">
                  {activeSp.epithet} · {CATEGORY_LABELS[activeProg.category]}
                </p>
                <ElementCrests elements={activeSp.elements} />
                {activeKnowledge === "full" ? (
                  <p className="rq-lore-copy">{activeSp.description}</p>
                ) : (
                  <p className="rq-lore-copy rq-muted-copy">
                    Sighting recorded in the wild. Bind a specimen to unlock full anatomy, base statistics, and lore records.
                  </p>
                )}
              </div>
              {pageView === "split" ? (
                <button
                  type="button"
                  className="btn-ghost rq-expand-btn"
                  onClick={() => setPageView("entry")}
                >
                  Open Tome Page
                </button>
              ) : null}
            </div>

            {activeKnowledge === "full" ? (
              <div className="rq-entry-sections">
                <div className="rq-info-block">
                  <h4 className="rq-subhead">Physical Profile &amp; Field Records</h4>
                  <p className="rq-data-line">
                    Typical {activeSp.dimensions.measurement}:{" "}
                    <strong>{formatSizeCm(activeSp.dimensions.typicalSizeCm)}</strong> · Weight:{" "}
                    <strong>{formatWeightKg(activeSp.dimensions.typicalWeightKg)}</strong>
                  </p>
                  <p className="rq-data-line">
                    {activeRecord?.smallestCm
                      ? `Bound range: ${formatSizeCm(activeRecord.smallestCm)} – ${formatSizeCm(activeRecord.largestCm ?? activeRecord.smallestCm)} (${formatWeightKg(activeRecord.lightestKg ?? activeSp.dimensions.typicalWeightKg)} – ${formatWeightKg(activeRecord.heaviestKg ?? activeSp.dimensions.typicalWeightKg)})`
                      : activeRecord?.encounteredMinCm
                        ? `Wild sighting range: ${formatSizeCm(activeRecord.encounteredMinCm)} – ${formatSizeCm(activeRecord.encounteredMaxCm ?? activeRecord.encounteredMinCm)}`
                        : "No personal field size extremes recorded yet."}
                  </p>
                  <p className="rq-data-line">
                    Bound: <strong>{activeRecord?.boundCount ?? (snap.caught[activeSp.id] ? 1 : 0)}</strong> · Wild victories:{" "}
                    <strong>{activeRecord?.defeatedCount ?? 0}</strong>
                  </p>
                </div>

                <div className="rq-info-block">
                  <h4 className="rq-subhead">Habitats &amp; Elemental Profile</h4>
                  <p className="rq-data-line">
                    {observedHabitats.length
                      ? `Observed habitats: ${observedHabitats.join(", ")}`
                      : theoreticalHabitats.length
                        ? `Known regions: ${theoreticalHabitats.join(", ")}`
                        : activeProg.category === "exceptional"
                          ? "Habitat: Fixed shrine encounter"
                          : activeProg.evolvedFrom
                            ? `Evolves from ${
                                discoveryKnowledgeLevel(
                                  activeProg.evolvedFrom.id,
                                  snap.seen,
                                  snap.caught,
                                  snap.records,
                                  SPECIES[activeProg.evolvedFrom.id],
                                ) !== "undiscovered"
                                  ? SPECIES[activeProg.evolvedFrom.id]?.name
                                  : "an earlier form"
                              }`
                            : "Habitat: Binding Grove pact"}
                  </p>
                  {activeMatchups ? (
                    <p className="rq-data-line">
                      {activeMatchups.strongAgainst.length ? `Hits hard: ${activeMatchups.strongAgainst.join(", ")} · ` : ""}
                      Weak to: {activeMatchups.weakAgainst.join(", ") || "None"} · Resists:{" "}
                      {activeMatchups.resistsAgainst.join(", ") || "None"}
                    </p>
                  ) : null}
                </div>

                <div className="rq-info-block rq-span-2">
                  <h4 className="rq-subhead">Species Base Attributes (Total {activeProg.bst})</h4>
                  <div className="rq-stats-grid">
                    <StatChartBar label="HP" value={activeSp.base.hp} />
                    <StatChartBar label="MP" value={activeSp.base.mp} />
                    <StatChartBar label="ATK" value={activeSp.base.atk} />
                    <StatChartBar label="DEF" value={activeSp.base.def} />
                    <StatChartBar label="MAG" value={activeSp.base.mag} />
                    <StatChartBar label="RES" value={activeSp.base.res} />
                    <StatChartBar label="SPD" value={activeSp.base.spd} />
                    <StatChartBar label="LCK" value={activeSp.base.lck} />
                  </div>
                </div>

                <div className="rq-info-block rq-span-2">
                  <h4 className="rq-subhead">Evolution Lineage</h4>
                  {activeProg.familyLength <= 1 ? (
                    <p className="rq-data-line">
                      {activeProg.category === "variant" && activeSp.variantOf
                        ? `Regional variant of ${
                            discoveryKnowledgeLevel(activeSp.variantOf, snap.seen, snap.caught, snap.records, SPECIES[activeSp.variantOf]) !== "undiscovered"
                              ? SPECIES[activeSp.variantOf]?.name
                              : "an unknown base form"
                          }`
                        : activeProg.category === "exceptional"
                          ? "Exceptional creature — stands outside ordinary evolutionary chains."
                          : "True single-stage species — matures cleanly without evolving."}
                    </p>
                  ) : (
                    <div className="rq-lineage-chain">
                      {activeProg.familyIds.map((stageId, idx) => {
                        const stageSp = SPECIES[stageId]!;
                        const stageKnown =
                          discoveryKnowledgeLevel(stageId, snap.seen, snap.caught, snap.records, stageSp) !== "undiscovered";
                        const prevStage = idx > 0 ? SPECIES[activeProg.familyIds[idx - 1]!] : null;
                        const evoLvl = prevStage?.evolves?.level;
                        return (
                          <div key={stageId} className="rq-lineage-step">
                            {idx > 0 ? (
                              <span className="rq-lineage-arrow" aria-hidden="true">
                                {evoLvl ? `Lv ${evoLvl} →` : "→"}
                              </span>
                            ) : null}
                            {stageKnown ? (
                              <button
                                type="button"
                                className={`rq-lineage-node${stageId === activeSp.id ? " is-current" : ""}`}
                                onClick={() => handleSelect(stageId, true)}
                              >
                                <img src={`/game/sprites/${stageId}.png`} alt="" />
                                <span>{stageSp.name}</span>
                              </button>
                            ) : (
                              <div className="rq-lineage-node is-sealed" aria-label={`Unbound stage ${idx + 1}`}>
                                <span className="unknown" aria-hidden="true">?</span>
                                <span>{evoLvl ? `Sealed (Lv ${evoLvl})` : "Sealed Entry"}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {pageView === "entry" ? (
                  <div className="rq-info-block rq-span-2">
                    <h4 className="rq-subhead">Natural Learnset</h4>
                    <div className="rq-learnset-chips">
                      {activeSp.learnset.map((entry) => (
                        <span key={`${entry.level}-${entry.skill}`} className="rq-learnset-chip">
                          Lv {entry.level}: {SKILLS[entry.skill]?.name ?? entry.skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rq-entry-sections">
                <div className="rq-info-block rq-span-2">
                  <h4 className="rq-subhead">Field Sighting Summary</h4>
                  <p className="rq-data-line">
                    {observedHabitats.length
                      ? `Observed habitats: ${observedHabitats.join(", ")}`
                      : theoreticalHabitats.length
                        ? `Encountered regions: ${theoreticalHabitats.join(", ")}`
                        : "Encountered on your journey."}
                  </p>
                  {activeRecord?.encounteredMinCm ? (
                    <p className="rq-data-line">
                      Observed {activeSp.dimensions.measurement}:{" "}
                      {formatSizeCm(activeRecord.encounteredMinCm)}
                      {activeRecord.encounteredMaxCm && activeRecord.encounteredMaxCm !== activeRecord.encounteredMinCm
                        ? ` – ${formatSizeCm(activeRecord.encounteredMaxCm)}`
                        : ""}
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        </FiligreeSurface>
      ) : (
        <p className="empty">No creatures spotted or bound yet. Walk into the wild to record entries.</p>
      )}

      {pageView === "split" ? (
        <>
          <div className="rq-filter-bar" role="region" aria-label="Filter and sort Reliquary entries">
            <div className="rq-filter-pills">
              {([
                ["all", "All"],
                ["bound", "Bound"],
                ["spotted", "Spotted"],
                ["undiscovered", "Sealed"],
                ["three_stage", "3-Stage"],
                ["single_stage", "Single"],
              ] as [FilterKind, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`rq-pill${filter === key ? " is-active" : ""}`}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="rq-filter-controls">
              <label className="rq-inline-select">
                <span>Element</span>
                <select
                  aria-label="Filter by element"
                  value={elementFilter}
                  onChange={(e) => setElementFilter(e.target.value as ElementId | "all")}
                >
                  <option value="all">All elements</option>
                  {(Object.keys(ELEMENTS) as ElementId[]).map((el) => (
                    <option key={el} value={el}>{ELEMENTS[el]!.name}</option>
                  ))}
                </select>
              </label>
              <label className="rq-inline-select">
                <span>Sort</span>
                <select
                  aria-label="Sort Reliquary entries"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKind)}
                >
                  <option value="number">Reliquary #</option>
                  <option value="status">Discovery</option>
                  <option value="element">Element</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>
          </div>

          <div className="reliq-grid" role="list">
            {filteredSpecies.map((sp) => {
              const knowledge = discoveryKnowledgeLevel(sp.id, snap.seen, snap.caught, snap.records, sp);
              const caught = knowledge === "full";
              const seen = knowledge === "encountered";
              const known = caught || seen;
              const isSelected = activeId === sp.id;
              const numLabel = `#${String(sp.collectionNumber).padStart(2, "0")}`;
              const stateLabel = caught
                ? `${sp.name} — bound to your compact`
                : seen
                  ? `${sp.name} — seen in the wild, not yet bound`
                  : `${numLabel} Unheard of — bind one to learn its name`;
              return (
                <div
                  key={sp.id}
                  role="listitem"
                  aria-label={known ? undefined : stateLabel}
                  className={`reliq-cell ${caught ? "have" : ""}${seen ? " seen" : ""}${isSelected ? " selected" : ""}`}
                  title={stateLabel}
                >
                  {known ? (
                    <button
                      type="button"
                      className="reliq-btn"
                      aria-label={stateLabel}
                      aria-pressed={isSelected}
                      onClick={() => handleSelect(sp.id)}
                    >
                      <span className="rq-cell-num">{numLabel}</span>
                      <img
                        src={`/game/sprites/${sp.id}.png`}
                        alt=""
                        className={seen ? "rq-silhouette-img" : ""}
                      />
                      <span>{sp.name}</span>
                    </button>
                  ) : (
                    <>
                      <span className="rq-cell-num">{numLabel}</span>
                      <span className="unknown" aria-hidden="true">?</span>
                      <span>——</span>
                    </>
                  )}
                </div>
              );
            })}
            {filteredSpecies.length === 0 ? <p className="empty">No Reliquary entries match those filters.</p> : null}
          </div>
        </>
      ) : null}
    </>
  );
}
