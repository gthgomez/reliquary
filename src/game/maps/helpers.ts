import type { MapObj } from "../types.ts";

export function tree(id: string, x: number, y: number): MapObj {
  return { id, sprite: "tree", x, y, w: 2, h: 2, foot: 1, solid: true };
}

export function house(id: string, sprite: string, x: number, y: number, interact: string): MapObj {
  return { id, sprite, x, y, w: 3, h: 3, foot: 2, solid: true, interact };
}

export function prop(id: string, sprite: string, x: number, y: number, interact?: string): MapObj {
  return { id, sprite, x, y, w: 1, h: 1, foot: 1, solid: true, interact };
}
