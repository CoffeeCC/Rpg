import { ICON_ART } from '../art/iconArt';

/**
 * Painted icon with emoji fallback. Icons are transparent PNGs (black keyed
 * out), so they composite cleanly on any dark surface.
 */
export function Icon({ name, emoji, size = 20 }: { name: string; emoji: string; size?: number }) {
  const src = ICON_ART[name];
  if (!src) return <span className="ui-icon-emoji">{emoji}</span>;
  return <img src={src} width={size} height={size} alt="" className="ui-icon" draggable={false} />;
}
