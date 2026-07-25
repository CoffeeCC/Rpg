import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ItemV2 } from '../engine/types';
import { gearImage } from '../art/gearArt';
import { setOfItem, wearableMax } from '../engine/data/sets';
import '../gearsets.css';

// v12: PoE/Diablo-style hover windows. Wrap any item row/slot in <ItemHover>
// and a full stat card follows the cursor — rarity header, implicits, affixes,
// flavor, and optional equip-compare deltas. Portaled to <body> so ancestor
// transforms/overflow can never clip it.

export interface CompareMetric {
  label: string;
  now: number;
  after: number;
}

const TIP_W = 320;

export function ItemHover({
  item,
  metrics,
  replaces,
  children,
}: {
  item: ItemV2;
  metrics?: CompareMetric[];
  replaces?: ItemV2 | null;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  const move = (e: React.MouseEvent) => {
    const h = tipRef.current?.offsetHeight ?? 300;
    const x = Math.min(e.clientX + 18, window.innerWidth - TIP_W - 12);
    const y = Math.min(Math.max(8, e.clientY - 40), window.innerHeight - h - 12);
    setPos({ x, y });
  };

  const implicits: string[] = [];
  if (item.implicitAttack) implicits.push(`+${item.implicitAttack} Attack`);
  if (item.implicitMagic) implicits.push(`+${item.implicitMagic} Magic`);
  if (item.implicitDefense) implicits.push(`+${item.implicitDefense} Defense`);
  const icon = gearImage(item);
  const changed = metrics?.filter((m) => m.after !== m.now) ?? [];
  // The set's full ladder. The LIVE count of what is worn belongs on the Gear
  // screen, which owns the loadout; this window only ever describes the piece
  // under the cursor, so it states the thresholds without claiming which one
  // is active.
  const set = setOfItem(item);

  return (
    <span className="item-hover-anchor" onMouseEnter={move} onMouseMove={move} onMouseLeave={() => setPos(null)}>
      {children}
      {pos &&
        createPortal(
          <div ref={tipRef} className={`item-tip item-tip-${item.rarity}`} style={{ left: pos.x, top: pos.y, width: TIP_W }}>
            <div className={`item-tip-head head-${item.rarity}`}>
              {icon && <img src={icon} width={40} height={40} alt="" draggable={false} />}
              <div>
                <div className={`item-tip-name rarity-${item.rarity}`}>{item.name}</div>
                <div className="item-tip-sub">
                  {item.rarity} {item.material} {item.baseType} · item level {item.ilvl}
                </div>
              </div>
            </div>
            {implicits.length > 0 && (
              <div className="item-tip-block item-tip-implicits">
                {implicits.map((s) => (
                  <div key={s}>{s}</div>
                ))}
              </div>
            )}
            {item.affixes.length > 0 && (
              <div className="item-tip-block item-tip-affixes">
                {item.affixes.map((a, i) => (
                  <div key={i}>
                    +{a.amount} {a.target} <span className="item-tip-affixname">({a.name})</span>
                  </div>
                ))}
              </div>
            )}
            {item.affixes.length === 0 && implicits.length === 0 && <div className="item-tip-block item-tip-plain">No enchantments. Honest metal.</div>}
            {set && (
              <div className="item-tip-block item-tip-set">
                <div className="item-tip-setname">
                  {set.name} <span className="item-tip-setcount">({wearableMax(set)} pieces)</span>
                </div>
                {set.bonuses.map((bonus) => (
                  <div key={bonus.pieces} className="item-tip-setline">
                    <b>{bonus.pieces} worn:</b> {bonus.terms}
                  </div>
                ))}
              </div>
            )}
            {changed.length > 0 && (
              <div className="item-tip-block item-tip-compare">
                {changed.map((m) => {
                  const d = m.after - m.now;
                  return (
                    <div key={m.label} className={d > 0 ? 'delta-up' : 'delta-down'}>
                      {m.label} {m.now} → {m.after} ({d > 0 ? '+' : ''}
                      {d})
                    </div>
                  );
                })}
                {replaces && <div className="item-tip-replaces">replaces {replaces.name}</div>}
              </div>
            )}
            <div className="item-tip-foot">☉ {item.value} gold</div>
          </div>,
          document.body,
        )}
    </span>
  );
}
