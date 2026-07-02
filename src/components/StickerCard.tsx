import type { Player } from '../data/types';
import { SQUAD_BY_ID } from '../data/squads';
import { STICKER_IMAGES, type StickerTier } from '../config';
import Flag from './Flag';

/** Tier identity for the sticker cards. These accents are the sticker rarity ramp
 *  (green -> amber -> gold foil), deliberately fixed rather than theme-swapped.
 *  `order` sorts the album Monumental-first (spec 5.4). */
export const TIER_META: Record<
  StickerTier,
  { name: string; accent: string; strip: string; stripText: string; order: number }
> = {
  monumental: {
    name: 'Monumental',
    accent: '#c99a3a',
    strip: 'linear-gradient(135deg,#f0cf8a,#c99a3a)',
    stripText: '#3a2a06',
    order: 0,
  },
  iconic: { name: 'Iconic', accent: '#e4922b', strip: '#e4922b', stripText: '#ffffff', order: 1 },
  legendary: { name: 'Legendary', accent: '#15924c', strip: '#15924c', stripText: '#ffffff', order: 2 },
};

// Sticker art is text + flag in v1. Real images are gated by STICKER_IMAGES in
// config.ts (drop <player.id>.png into public/stickers/ and flip it on); when set,
// StickerCard renders the image over the face with a fallback to text+flag.
// Base-path aware so it resolves under '/' in dev and '/wcsim/' on Pages.
const artSrc = (id: string) => `${import.meta.env.BASE_URL}stickers/${id}.png`;

interface Props {
  player: Player;
  tier: StickerTier;
  collected: boolean;
  duplicateCount?: number;
  /** Highlight as freshly earned (run-end summary). */
  isNew?: boolean;
  /** When set, the card is a pickable button (cup reward / trade options). */
  onPick?: () => void;
}

export default function StickerCard({
  player,
  tier,
  collected,
  duplicateCount = 0,
  isNew = false,
  onPick,
}: Props) {
  const meta = TIER_META[tier];
  const squad = SQUAD_BY_ID[player.squadId];
  const nation = squad?.nation ?? '';
  const year = squad?.year;
  const code = squad?.code ?? '';

  const inner = (
    <>
      <div className="flex items-center justify-between px-2.5 pt-2">
        <span
          className="font-mono text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted"
          style={collected ? { color: meta.accent } : undefined}
        >
          {meta.name}
        </span>
        {collected && duplicateCount > 0 ? (
          <span className="rounded-full bg-amber px-1.5 py-px font-mono text-[10px] font-bold leading-none text-white">
            &times;{duplicateCount}
          </span>
        ) : !collected ? (
          <span className="font-mono text-[11px] leading-none text-muted">&#9671;</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col items-center gap-1.5 px-3 pb-3 pt-2 text-center">
        {STICKER_IMAGES && collected && (
          <img
            src={artSrc(player.id)}
            alt=""
            className="mb-1 aspect-square w-full object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <Flag code={code} className={`h-5 w-[30px] ${collected ? '' : 'opacity-40 grayscale'}`} />
        <div
          className={`font-display text-[13.5px] font-extrabold leading-tight ${
            collected ? '' : 'text-muted'
          }`}
        >
          {player.name}
        </div>
        <div className="font-mono text-[10px] text-muted">
          {nation}
          {year ? ` · ${year}` : ''}
        </div>
      </div>
      <div
        className="flex items-baseline justify-center gap-1.5 px-2.5 py-1.5"
        style={collected ? { background: meta.strip, color: meta.stripText } : undefined}
      >
        {collected ? (
          <>
            <span className="font-mono text-[22px] font-bold leading-none">{player.elo}</span>
            <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.14em] opacity-80">
              Rating
            </span>
          </>
        ) : (
          <span className="font-mono text-[22px] font-bold leading-none text-muted/50">?</span>
        )}
      </div>
    </>
  );

  const base = 'flex flex-col overflow-hidden rounded-md border';
  const cls = collected
    ? `${base} border-line bg-panel shadow-hard`
    : `${base} border-dashed border-line bg-ground/60`;
  const style: React.CSSProperties = {
    borderTop: `3px solid ${meta.accent}`,
    ...(isNew ? { outline: '2px solid #e4922b', outlineOffset: '2px' } : {}),
  };

  if (onPick) {
    return (
      <button
        type="button"
        onClick={onPick}
        className={`${cls} cursor-pointer text-left transition hover:-translate-y-0.5`}
        style={style}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}
