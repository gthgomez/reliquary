import type { BattleCommand } from "../../world/encounters.ts";
import { BattleCommandIcon } from "./BattleIcons.tsx";
import type { BattleCommandSlot } from "./battle-commands.ts";

export type BattleActionGridProps = {
  slots: readonly BattleCommandSlot[];
  selected: BattleCommand;
  /** True while an animation resolves: every slot is inert. */
  locked?: boolean;
  onFocusCommand: (command: BattleCommand) => void;
  onActivateCommand: (command: BattleCommand) => void;
};

export function BattleActionGrid({
  slots,
  selected,
  locked = false,
  onFocusCommand,
  onActivateCommand,
}: BattleActionGridProps) {
  return (
    <div className="battle-action-grid" role="group" aria-label="Battle commands">
      {slots.map((slot) => {
        const inert = locked || !slot.available;
        const isSelected = slot.id === selected;
        return (
          <button
            key={slot.id}
            type="button"
            data-command={slot.id}
            className={`battle-action${isSelected ? " is-selected" : ""}${inert ? " is-inert" : ""}`}
            aria-pressed={isSelected}
            aria-disabled={inert}
            aria-label={slot.unavailableReason ? `${slot.label}. ${slot.unavailableReason}` : slot.label}
            tabIndex={isSelected ? 0 : -1}
            onPointerEnter={() => onFocusCommand(slot.id)}
            onFocus={() => onFocusCommand(slot.id)}
            onClick={() => {
              if (inert) return;
              onActivateCommand(slot.id);
            }}
          >
            <span className="battle-action-icon" aria-hidden>
              <BattleCommandIcon command={slot.id} size={30} />
            </span>
            <span className="battle-action-label">{slot.label}</span>
            {!slot.available ? <span className="battle-action-lock" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
