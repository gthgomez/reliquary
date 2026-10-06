export type BattleAction =
  | { type: "strike" }
  | { type: "skill"; skill: string }
  | { type: "item"; item: string; targetIndex: number }
  | { type: "bind"; item: string }
  | { type: "switch"; index: number }
  | { type: "flee" };

export type BattleEvent =
  | { kind: "message"; text: string }
  | { kind: "hit"; critical: boolean }
  | { kind: "miss" }
  | { kind: "heal" }
  | { kind: "status" }
  | { kind: "faint" }
  | { kind: "confirm" }
  | { kind: "fail" };
