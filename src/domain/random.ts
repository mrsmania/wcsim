// Shared randomness helpers. Uses Math.random intentionally, matching the sim.

/** A shuffled copy of `arr` (Fisher-Yates; the input is left untouched). */
export function shuffled<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
