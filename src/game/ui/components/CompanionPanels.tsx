import type { ReactNode } from "react";
import { useState } from "react";
import {
  calcStats,
  currentStats,
  ELEMENTS,
  expToNext,
  MAX_LEVEL,
  PRACTICE_COST,
  SKILLS,
  SPECIES,
  TEMPERAMENTS,
} from "../../content";
import type { ReliquaryGame } from "../../engine";
import {
  describeMorphology,
  formatSizeCm,
  formatWeightKg,
  morphologyStatMultipliers,
} from "../../systems/morphology";
import {
  analyzeEvolutionGraph,
  CATEGORY_LABELS,
  elementMatchups,
  formatEvolutionLine,
} from "../../systems/species-progression";
import type { Beast, ElementId, Snapshot } from "../../types";
import { leadActionHint, practiceActionHint, practiceEnabledHint } from "../party-actions";
import {
  ElementCrests,
  FiligreeSurface,
  PortraitCrest,
  ReliquaryBadge,
  StatChartBar,
} from "./ReliquaryPrimitives";

const PROGRESSION_ENTRIES = analyzeEvolutionGraph(SPECIES, MAX_LEVEL).entries;

type DetailTab = "overview" | "skills" | "compare";
type StorageSort = "level" | "number" | "name" | "element";

function skillCoverageElements(skillIds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of skillIds) {
    const sk = SKILLS[id];
    if (sk && sk.power > 0) {
      out.add(ELEMENTS[sk.element]?.name ?? sk.element);
    }
  }
  return [...out];
}

export function CompanionCard({
  beast,
  isLead,
  selected,
  onInspect,
  inspectLabel = "Inspect details",
  children,
}: {
  beast: Beast;
  isLead?: boolean;
  selected?: boolean;
  onInspect?: () => void;
  inspectLabel?: string;
  children?: ReactNode;
}) {
  const sp = SPECIES[beast.speciesId]!;
  const st = currentStats(beast);
  const t = TEMPERAMENTS[beast.temperament];
  const morph = describeMorphology(beast, sp);
  const hpPct = st.hp > 0 ? Math.max(0, Math.min(100, (beast.hp / st.hp) * 100)) : 0;
  const mpPct = st.mp > 0 ? Math.max(0, Math.min(100, (beast.mp / st.mp) * 100)) : 0;
  const nextExp = expToNext(beast.level);
  const expPct = beast.level >= MAX_LEVEL ? 100 : Math.max(0, Math.min(100, (beast.exp / nextExp) * 100));

  return (
    <article className={`beast-card rq-card${selected ? " beast-card-active is-selected" : ""}`}>
      <div className="rq-card-aside">
        <PortraitCrest speciesId={beast.speciesId} alt="" size="md" />
        <ElementCrests elements={sp.elements} />
      </div>
      <div className="rq-card-main">
        <div className="rq-card-header">
          <div>
            <h3>
              <span className="beast-name">{beast.nickname}</span>{" "}
              <small>Lv {beast.level}</small>
            </h3>
            <p className="rq-card-sub">
              {sp.name} · {sp.combatRole} · {t.name}
            </p>
          </div>
          <div className="rq-card-badges">
            {isLead ? <ReliquaryBadge tone="gold">Lead</ReliquaryBadge> : null}
            {beast.hp <= 0 ? <ReliquaryBadge tone="warning">Fainted</ReliquaryBadge> : null}
            {morph.isRare ? (
              <ReliquaryBadge tone="rare">{morph.rareLabel}</ReliquaryBadge>
            ) : (
              <ReliquaryBadge tone="bronze">{morph.build}</ReliquaryBadge>
            )}
          </div>
        </div>

        <div className="rq-card-meters">
          <div className="meter" role="group" aria-label={`Health ${beast.hp} of ${st.hp}`}>
            <div className="meter-head">
              <span className="meter-kicker">Vitality</span>
              <span className="meter-frac"><abbr title="Health" className="meter-abbr">HP</abbr> {beast.hp}/{st.hp}</span>
            </div>
            <div className="meter-track" aria-hidden><div className="meter-fill hp" style={{ width: `${hpPct}%` }} /></div>
          </div>
          <div className="meter" role="group" aria-label={`Skill points ${beast.mp} of ${st.mp}`}>
            <div className="meter-head">
              <span className="meter-kicker">Mist</span>
              <span className="meter-frac"><abbr title="Skill points" className="meter-abbr">MP</abbr> {beast.mp}/{st.mp}</span>
            </div>
            <div className="meter-track" aria-hidden><div className="meter-fill mp" style={{ width: `${mpPct}%` }} /></div>
          </div>
          {beast.level < MAX_LEVEL ? (
            <div className="meter" role="group" aria-label={`Lore (experience to next level) ${beast.exp} of ${nextExp}`}>
              <div className="meter-head">
                <span className="meter-kicker">Lore (experience to next level)</span>
                <span className="meter-frac"><abbr title="Lore (experience to next level)" className="meter-abbr">Lore</abbr> {beast.exp}/{nextExp}</span>
              </div>
              <div className="meter-track" aria-hidden><div className="meter-fill rq-exp-fill" style={{ width: `${expPct}%` }} /></div>
            </div>
          ) : (
            <p className="skills">Level cap reached</p>
          )}
        </div>

        <p className="rq-phys-line">
          {morph.measurementLabel}: {formatSizeCm(morph.sizeCm)} · {formatWeightKg(morph.weightKg)}
          {sp.evolves ? ` · Evolves Lv ${sp.evolves.level}` : ""}
        </p>

        <p className="beast-stats-line">
          ATK {st.atk} · DEF {st.def} · MAG {st.mag} · RES {st.res} · SPD {st.spd} · LCK {st.lck}
        </p>

        <div className="beast-actions">
          {onInspect ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={onInspect}
              aria-label={`${inspectLabel} for ${beast.nickname}`}
            >
              Details &amp; Compare
            </button>
          ) : null}
          {children}
        </div>
      </div>
    </article>
  );
}

export function PartyPanel({
  game,
  snap,
  renderRename,
}: {
  game: ReliquaryGame;
  snap: Snapshot;
  renderRename: (beast: Beast) => ReactNode;
}) {
  const emptySlots = Math.max(0, 4 - snap.party.length);
  return (
      <div className="party-grid">
        {snap.party.map((b, index) => (
          <CompanionCard
            key={b.uid}
            beast={b}
            isLead={index === 0}
            selected={index === snap.menuIndex}
            onInspect={() => game.openCardMenu(b.uid)}
          >
            {b.pendingSkills?.length ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => game.openLearnMenu(b.uid)}
                aria-label={`Teach ${b.nickname} ${SKILLS[b.pendingSkills[0]!]?.name ?? b.pendingSkills[0]}`}
              >
                Learn {SKILLS[b.pendingSkills[0]!]?.name ?? b.pendingSkills[0]}
                {b.pendingSkills.length > 1 ? ` (${b.pendingSkills.length})` : ""}
              </button>
            ) : null}
            <div className="action-with-hint">
              <button
                type="button"
                className={index === 0 ? "btn-lead-active" : "btn-ghost"}
                disabled={index !== 0 && b.hp <= 0}
                aria-pressed={index === 0}
                onClick={() => {
                  if (index !== 0 && b.hp > 0) game.setLead(b.uid);
                }}
                aria-label={`Make ${b.nickname} lead`}
                aria-describedby={`lead-hint-${b.uid}`}
              >
                {index === 0 ? "Party lead" : "Make lead"}
              </button>
              <p id={`lead-hint-${b.uid}`} className="action-hint" role="note">
                {leadActionHint(index, b) ?? "Send this companion to the front of the party and into battle first."}
              </p>
            </div>
            {renderRename(b)}
            <div className="action-with-hint">
              <button
                type="button"
                className="btn-ghost"
                disabled={b.hp <= 0 || b.level >= MAX_LEVEL || snap.gold < PRACTICE_COST}
                onClick={() => game.trainCreature(b.uid)}
                aria-label={`Practice with ${b.nickname} for ${PRACTICE_COST} crowns`}
                aria-describedby={`practice-hint-${b.uid}`}
              >
                Practice · {PRACTICE_COST} cr
              </button>
              <p id={`practice-hint-${b.uid}`} className="action-hint" role="note">
                {practiceActionHint(b, snap.gold) ?? practiceEnabledHint()}
              </p>
            </div>
          </CompanionCard>
        ))}
        {snap.party.length > 0 && emptySlots > 0
          ? Array.from({ length: emptySlots }).map((_, idx) => (
              <div key={`slot-empty-${idx}`} className="rq-empty-slot" aria-hidden="true">
                <span>Empty Pact Slot</span>
                <small>Bind wild creatures or recall from Storage</small>
              </div>
            ))
          : null}
        {snap.party.length === 0 ? <p className="empty">No pact spoken yet.</p> : null}
      </div>
  );
}

export function StoragePanel({
  game,
  snap,
}: {
  game: ReliquaryGame;
  snap: Snapshot;
}) {
  const [elementFilter, setElementFilter] = useState<ElementId | "all">("all");
  const [sort, setSort] = useState<StorageSort>("level");

  const filteredBox = snap.box
    .map((beast, boxIdx) => ({ beast, originalIndex: snap.party.length + boxIdx }))
    .filter(({ beast }) => {
      if (elementFilter === "all") return true;
      return SPECIES[beast.speciesId]?.elements.includes(elementFilter);
    })
    .sort((a, b) => {
      const spA = SPECIES[a.beast.speciesId]!;
      const spB = SPECIES[b.beast.speciesId]!;
      if (sort === "name") return a.beast.nickname.localeCompare(b.beast.nickname);
      if (sort === "number") return spA.collectionNumber - spB.collectionNumber;
      if (sort === "element") {
        return (spA.elements[0] ?? "").localeCompare(spB.elements[0] ?? "") || b.beast.level - a.beast.level;
      }
      return b.beast.level - a.beast.level || spA.collectionNumber - spB.collectionNumber;
    });

  return (
    <>
      <h3 className="sheet-section">Travelling companions</h3>
      <div className="party-grid">
        {snap.party.map((b, index) => (
          <CompanionCard
            key={b.uid}
            beast={b}
            isLead={index === 0}
            selected={index === snap.menuIndex}
            onInspect={() => game.openCardMenu(b.uid)}
          >
            <button
              type="button"
              className="btn-ghost"
              onClick={() => game.transferBeast(b.uid, "box")}
              aria-label={`Store ${b.nickname}`}
            >
              Store
            </button>
          </CompanionCard>
        ))}
      </div>

      <div className="rq-storage-bar">
        <h3 className="sheet-section">Stored creatures</h3>
        {snap.box.length > 0 ? (
          <div className="rq-filter-controls">
            <label className="rq-inline-select">
              <span>Element</span>
              <select
                aria-label="Filter stored creatures by element"
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
                aria-label="Sort stored creatures"
                value={sort}
                onChange={(e) => setSort(e.target.value as StorageSort)}
              >
                <option value="level">Highest Lv</option>
                <option value="number">Reliquary #</option>
                <option value="element">Element</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <div className="party-grid">
        {filteredBox.map(({ beast: b, originalIndex }) => (
          <CompanionCard
            key={b.uid}
            beast={b}
            selected={originalIndex === snap.menuIndex}
            onInspect={() => game.openCardMenu(b.uid)}
          >
            <div className="action-with-hint">
              <button
                type="button"
                className="btn-ghost"
                disabled={snap.party.length >= 4}
                onClick={() => game.transferBeast(b.uid, "party")}
                aria-label={`Add ${b.nickname} to party`}
                aria-describedby={`store-in-hint-${b.uid}`}
              >
                Add to party
              </button>
              {snap.party.length >= 4 ? (
                <p id={`store-in-hint-${b.uid}`} className="action-hint" role="note">
                  Party is full (4/4). Store a traveller first.
                </p>
              ) : null}
            </div>
          </CompanionCard>
        ))}
        {snap.box.length === 0 ? <p className="empty">No creatures in storage yet.</p> : null}
        {snap.box.length > 0 && filteredBox.length === 0 ? (
          <p className="empty">No stored creatures match that element.</p>
        ) : null}
      </div>
    </>
  );
}

export function CompanionDetailOverlay({
  game,
  snap,
  onViewInReliquary,
}: {
  game: ReliquaryGame;
  snap: Snapshot;
  onViewInReliquary: (speciesId: string, uid: string) => void;
}) {
  const card = snap.cardMenu!;
  const allBeasts = [...snap.party, ...snap.box];
  const beast = allBeasts.find((b) => b.uid === card.uid);
  const [tab, setTab] = useState<DetailTab>("overview");
  const candidates = allBeasts.filter((b) => b.uid !== card.uid);
  const [compareUid, setCompareUid] = useState<string>(candidates[0]?.uid ?? "");
  const [equalLevel, setEqualLevel] = useState(true);

  if (!beast) return null;
  const sp = SPECIES[beast.speciesId]!;
  const prog = PROGRESSION_ENTRIES[beast.speciesId];
  const stats = currentStats(beast);
  const t = TEMPERAMENTS[beast.temperament];
  const morph = describeMorphology(beast, sp);
  const morphMul = morphologyStatMultipliers(beast.morphology);
  const matchups = elementMatchups(sp.elements);
  const skillCoverage = skillCoverageElements(beast.skills);

  const actionLabels: Record<string, (nickname: string) => string> = {
    lead: (n) => `Make ${n} lead`,
    practice: () => `Practice · ${PRACTICE_COST} cr`,
    learn: () => "Learn a new skill",
    rename: () => "Rename",
    store: (n) => `Store ${n}`,
    in: (n) => `Add ${n} to the party`,
  };

  const peer = candidates.find((c) => c.uid === compareUid) ?? candidates[0] ?? null;
  const peerSp = peer ? SPECIES[peer.speciesId]! : null;
  const peerMorph = peer && peerSp ? describeMorphology(peer, peerSp) : null;
  const compareLv = equalLevel ? Math.max(beast.level, peer?.level ?? beast.level) : null;
  const baseLeft = compareLv !== null ? calcStats(sp, compareLv, beast.ivs, beast.temperament, beast.morphology) : stats;
  const baseRight = peer && peerSp
    ? calcStats(peerSp, compareLv ?? peer.level, peer.ivs, peer.temperament, peer.morphology)
    : null;

  return (
    <>
      <div className="rq-tab-strip" role="tablist" aria-label="Companion details sections">
        {(
          [
            ["overview", "Overview"],
            ["skills", `Skills (${beast.skills.length})`],
            ["compare", "Compare"],
          ] as [DetailTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`rq-tab-btn${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="btn-ghost rq-tab-extra"
          onClick={() => onViewInReliquary(beast.speciesId, beast.uid)}
        >
          View in Reliquary
        </button>
      </div>

      {tab === "overview" ? (
        <FiligreeSurface className="rq-dossier-panel">
          <div className="rq-entry-hero">
            <PortraitCrest speciesId={beast.speciesId} alt={beast.nickname} size="lg" />
            <div className="rq-entry-meta">
              <div className="reliq-detail-head">
                <strong>{beast.nickname}</strong>
                <ReliquaryBadge tone={morph.isRare ? "rare" : "bronze"}>
                  {morph.build} Build
                </ReliquaryBadge>
                <ReliquaryBadge tone="emerald">{sp.combatRole}</ReliquaryBadge>
              </div>
              <p className="rq-epithet">
                {sp.epithet} · {t.name} (+{t.up.toUpperCase()} / -{t.down.toUpperCase()})
              </p>
              <ElementCrests elements={sp.elements} />
              <p className="rq-data-line">
                Lineage: {formatEvolutionLine(sp.id, SPECIES, PROGRESSION_ENTRIES)}
                {prog?.category ? ` · ${CATEGORY_LABELS[prog.category]}` : ""}
              </p>
              <p className="rq-data-line">
                {morph.measurementLabel}: <strong>{formatSizeCm(morph.sizeCm)}</strong> (typical {formatSizeCm(sp.dimensions.typicalSizeCm)}) · Weight:{" "}
                <strong>{formatWeightKg(morph.weightKg)}</strong> (typical {formatWeightKg(sp.dimensions.typicalWeightKg)})
              </p>
              <p className="rq-data-line">
                Build trade-offs:{" "}
                <span>HP {Math.round((morphMul.hp - 1) * 100) >= 0 ? "+" : ""}{Math.round((morphMul.hp - 1) * 100)}%</span> ·{" "}
                <span>ATK {Math.round((morphMul.atk - 1) * 100) >= 0 ? "+" : ""}{Math.round((morphMul.atk - 1) * 100)}%</span> ·{" "}
                <span>DEF {Math.round((morphMul.def - 1) * 100) >= 0 ? "+" : ""}{Math.round((morphMul.def - 1) * 100)}%</span> ·{" "}
                <span>SPD {Math.round((morphMul.spd - 1) * 100) >= 0 ? "+" : ""}{Math.round((morphMul.spd - 1) * 100)}%</span> ·{" "}
                <span>LCK {Math.round((morphMul.lck - 1) * 100) >= 0 ? "+" : ""}{Math.round((morphMul.lck - 1) * 100)}%</span>
              </p>
            </div>
          </div>

          <div className="rq-entry-sections">
            <div className="rq-info-block rq-span-2">
              <h4 className="rq-subhead">Battle Attributes</h4>
              <div className="rq-stats-grid">
                <StatChartBar label="HP" value={stats.hp} max={180} deltaPct={morph.hpDeltaPct} />
                <StatChartBar label="MP" value={stats.mp} max={140} />
                <StatChartBar label="ATK" value={stats.atk} max={140} deltaPct={morph.atkDeltaPct} />
                <StatChartBar label="DEF" value={stats.def} max={140} deltaPct={morph.defDeltaPct} />
                <StatChartBar label="MAG" value={stats.mag} max={140} />
                <StatChartBar label="RES" value={stats.res} max={140} />
                <StatChartBar label="SPD" value={stats.spd} max={140} deltaPct={morph.spdDeltaPct} />
                <StatChartBar label="LCK" value={stats.lck} max={140} deltaPct={morph.lckDeltaPct} />
              </div>
            </div>

            <div className="rq-info-block rq-span-2">
              <h4 className="rq-subhead">Elemental Profile</h4>
              <p className="rq-data-line">
                Offensive skill types: {skillCoverage.join(", ") || "Basic Strike"}
              </p>
              <p className="rq-data-line">
                Vulnerable to: {matchups.weakAgainst.join(", ") || "None"} · Resists:{" "}
                {matchups.resistsAgainst.join(", ") || "None"}
              </p>
            </div>
          </div>
        </FiligreeSurface>
      ) : null}

      {tab === "skills" ? (
        <FiligreeSurface className="rq-dossier-panel">
          {beast.pendingSkills?.length ? (
            <div className="rq-pending-banner">
              <span>
                Queued offer: <strong>{SKILLS[beast.pendingSkills[0]!]?.name ?? beast.pendingSkills[0]}</strong>
              </span>
              <button
                type="button"
                className="btn-primary"
                onClick={() => game.openLearnMenu(beast.uid)}
              >
                Decide now
              </button>
            </div>
          ) : null}
          <div className="rq-skill-grid">
            {beast.skills.map((skillId) => {
              const sk = SKILLS[skillId];
              if (!sk) return null;
              return (
                <div key={skillId} className="rq-skill-card">
                  <div className="rq-skill-head">
                    <strong>{sk.name}</strong>
                    <span className="rq-crest" style={{ ["--crest-tone" as string]: ELEMENTS[sk.element]?.color ?? "#a98a55" }}>
                      {ELEMENTS[sk.element]?.name ?? sk.element}
                    </span>
                  </div>
                  <p className="rq-skill-meta">
                    {sk.kind.toUpperCase()} · {sk.power > 0 ? `Pow ${sk.power}` : "Effect"} · Acc {sk.accuracy}% · {sk.mp} MP
                  </p>
                  <p className="rq-data-line">{sk.desc}</p>
                </div>
              );
            })}
          </div>
        </FiligreeSurface>
      ) : null}

      {tab === "compare" ? (
        <FiligreeSurface className="rq-dossier-panel">
          {candidates.length === 0 ? (
            <p className="empty">Bind a second creature to compare stats, roles, and physical builds side by side.</p>
          ) : peer && peerSp && peerMorph && baseRight ? (
            <>
              <div className="rq-compare-controls">
                <label className="rq-inline-select">
                  <span>Compare against</span>
                  <select
                    aria-label="Choose companion to compare"
                    value={peer.uid}
                    onChange={(e) => setCompareUid(e.target.value)}
                  >
                    {candidates.map((cand) => (
                      <option key={cand.uid} value={cand.uid}>
                        {cand.nickname} ({SPECIES[cand.speciesId]?.name} Lv {cand.level})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={`rq-pill${equalLevel ? " is-active" : ""}`}
                  aria-pressed={equalLevel}
                  onClick={() => setEqualLevel((v) => !v)}
                >
                  {equalLevel ? `Scaled to Lv ${compareLv}` : "Actual levels"}
                </button>
              </div>
              <div className="rq-compare-heads">
                <div>
                  <strong>{beast.nickname}</strong> <small>Lv {compareLv ?? beast.level} · {morph.build} ({formatSizeCm(morph.sizeCm)})</small>
                </div>
                <div>
                  <strong>{peer.nickname}</strong> <small>Lv {compareLv ?? peer.level} · {peerMorph.build} ({formatSizeCm(peerMorph.sizeCm)})</small>
                </div>
              </div>
              <div className="rq-stats-grid">
                <StatChartBar label="HP" value={baseLeft.hp} max={180} compareValue={baseRight.hp} />
                <StatChartBar label="MP" value={baseLeft.mp} max={140} compareValue={baseRight.mp} />
                <StatChartBar label="ATK" value={baseLeft.atk} max={140} compareValue={baseRight.atk} />
                <StatChartBar label="DEF" value={baseLeft.def} max={140} compareValue={baseRight.def} />
                <StatChartBar label="MAG" value={baseLeft.mag} max={140} compareValue={baseRight.mag} />
                <StatChartBar label="RES" value={baseLeft.res} max={140} compareValue={baseRight.res} />
                <StatChartBar label="SPD" value={baseLeft.spd} max={140} compareValue={baseRight.spd} />
                <StatChartBar label="LCK" value={baseLeft.lck} max={140} compareValue={baseRight.lck} />
              </div>
            </>
          ) : null}
        </FiligreeSurface>
      ) : null}

      <h4 className="rq-manage-head">Companion Actions</h4>
      <ul className="menu-list">
        {card.actions.map((action, i) => (
          <li key={action}>
            <button
              type="button"
              className={i === snap.menuIndex ? "active" : ""}
              onClick={() => game.chooseMenu(i)}
            >
              {actionLabels[action]?.(beast.nickname) ?? action}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
