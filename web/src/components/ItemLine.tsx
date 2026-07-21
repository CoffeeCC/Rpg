import type { ItemV2 } from '../engine/types';
import { gearImage } from '../art/gearArt';

export function ItemLine({ item, showAffixes = true, iconSize = 44 }: { item: ItemV2; showAffixes?: boolean; iconSize?: number }) {
  const implicits: string[] = [];
  if (item.implicitAttack) implicits.push(`Atk +${item.implicitAttack}`);
  if (item.implicitMagic) implicits.push(`Mag +${item.implicitMagic}`);
  if (item.implicitDefense) implicits.push(`Def +${item.implicitDefense}`);
  const icon = gearImage(item);

  return (
    <div className="item-line">
      {icon && <img src={icon} width={iconSize} height={iconSize} alt="" className={`gear-icon rarity-frame-${item.rarity}`} draggable={false} />}
      <div className="item-line-body">
        <span className={`rarity-${item.rarity}`}>{item.name}</span>
        <span className="pill">
          {item.baseType} · ilvl {item.ilvl}
        </span>
        {showAffixes && (
          <div className="affix-line">
            {[...implicits, ...item.affixes.map((a) => `${a.target} +${a.amount}`)].join(' · ') || 'No bonuses'}
          </div>
        )}
      </div>
    </div>
  );
}
