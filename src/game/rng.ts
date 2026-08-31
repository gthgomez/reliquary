export type RandomSource = () => number;

export const mathRandom: RandomSource = () => Math.random();

/** Deterministic source for mechanic tests; values repeat when exhausted. */
export function sequenceRandom(values: number[]): RandomSource {
  if (values.length === 0) throw new Error("sequenceRandom requires at least one value");
  let index = 0;
  return () => {
    const value = values[index % values.length]!;
    index += 1;
    return value;
  };
}
