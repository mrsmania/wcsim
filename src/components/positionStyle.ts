import type { Position, PositionCategory } from '../data/types';
import { categoryOf } from '../data/types';

/** Tailwind classes for a small position/category chip (light theme). */
export const CATEGORY_CHIP: Record<PositionCategory, string> = {
  GK: 'bg-amber-200 text-amber-900',
  DEF: 'bg-sky-200 text-sky-900',
  MID: 'bg-emerald-200 text-emerald-900',
  FWD: 'bg-rose-200 text-rose-900',
};

export function chipFor(position: Position): string {
  return CATEGORY_CHIP[categoryOf(position)];
}
