import { ICON_ART } from '../art/iconArt';

/**
 * Painted icon with emoji fallback. Icons are painted on pure black and
 * composite via mix-blend-mode: screen (same trick as the character art),
 * so they sit cleanly on any dark surface.
 */
export function Icon({ name, emoji, size = 20 }: { name: string; emoji: string; size?: number }) {
  const src = ICON_ART[name];
  if (!src) return <span className="ui-icon-emoji">{emoji}</span>;
  return <img src={src} width={size} height={size} alt="" className="ui-icon" draggable={false} />;
}
