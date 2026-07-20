import type { ItemV2 } from '../engine/types';

export function ItemLine({ item, showAffixes = true }: { item: ItemV2; showAffixes?: boolean }) {
  const implicits: string[] = [];
  if (item.implicitAttack) implicits.push(`Atk +${item.implicitAttack}`);
  if (item.implicitMagic) implicits.push(`Mag +${item.implicitMagic}`);
  if (item.implicitDefense) implicits.push(`Def +${item.implicitDefense}`);

  return (
    <div>
      <span className={`rarity-${item.rarity}`}>
        {item.name}
      </span>
      <span className="pill">
        {item.baseType} · ilvl {item.ilvl}
      </span>
      {showAffixes && (
        <div className="affix-line">
          {[...implicits, ...item.affixes.map((a) => `${a.target} +${a.amount}`)].join(' · ') || 'No bonuses'}
        </div>
      )}
    </div>
  );
}
