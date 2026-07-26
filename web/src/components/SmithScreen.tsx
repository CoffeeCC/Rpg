import { useRef, useState } from 'react';
import { recastCandidates, recastCost, type GameAction, type GameState } from '../engine/game';
import { CLASS_DECKS, RACE_CARDS, TAME_CARD_ID, getCard } from '../engine/data/cards';
import { BALANCE } from '../engine/data/balance';
import { CardView } from './CardView';
import { play as sfx } from '../platform/sfx';
import { NpcHost } from './NpcHost';
import { Icon } from './Icon';
import { ItemLine } from './ItemLine';
import { setOfItem } from '../engine/data/sets';
import { useNavScope } from '../nav';
import { useConfirmAction } from './ConfirmOverlay';
import {
  MAX_VAULT_SLOTS,
  VAULT_SLOT_COSTS,
  buyVaultSlot,
  canLift,
  depositToVault,
  loadTellings,
  vaultRejection,
  withdrawFromVault,
} from '../platform/tellings';
import '../services.css';
import '../gearsets.css';

// The Forge holds two things now: the anvil, and the back wall.
//
// The wall lives here rather than on a screen of its own because App.tsx's
// routing belongs to another owner, and because it belongs here anyway — the
// wall is Grude's, and every line she has ever had about it is about keeping
// other people's steel in the room she works in.
//
// Every localStorage write below happens inside an onClick. That is deliberate
// and load-bearing: React double-invokes REDUCERS under StrictMode but not
// event handlers, and taking a piece off the wall is the one operation here
// that cannot be made idempotent (see `withdrawFromVault`). The reducer actions
// these handlers dispatch only ever move an item in or out of the hero's bag,
// and both are written to no-op on a second application.

export function SmithScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const all = [...CLASS_DECKS[player.className], ...RACE_CARDS[player.race], TAME_CARD_ID];
  const ids = [...new Set(all)];
  const charmCost = 90 + player.level * 10;
  const trinketCost = 110 + player.level * 12;

  const [meta, setMeta] = useState(loadTellings);
  const [notice, setNotice] = useState<string | null>(null);

  const bankable = player.items.filter((i) => i.rarity === 'Legendary');
  const recastable = recastCandidates(player);
  const recastPrice = recastCost(player);

  // Recast melts a Legendary and hands back a random one — the piece that went
  // into the fire is gone whatever comes out. Also not on the C5 list, and it
  // is the only button in town that destroys named steel.
  const guard = useConfirmAction();

  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, {
    id: 'smith',
    onCancel: () => {
      dispatch({ type: 'GOTO', screen: 'town' });
      return true;
    },
  });

  return (
    <div className="panel" ref={root}>
      <h1 className="title title-with-icon"><Icon name="smith" size={26} emoji="" /> The Forge</h1>
      <NpcHost npcId="grude" state={state} />
      <div className="svc-stock-head">
        <span className="svc-stock-title">Grude's anvil</span>
        <span className="price-chip svc-purse" title="Your purse">☉ {player.gold}g</span>
      </div>

      {/* ================= The back wall ================= */}
      <h2 className="svc-section">The Back Wall</h2>
      <p className="subtitle vault-blurb">
        Grude keeps what the dead did not come back for. She will keep{' '}
        {meta.vaultSlots === 0 ? 'nothing of yours yet' : `${meta.vaultSlots} ${meta.vaultSlots === 1 ? 'piece' : 'pieces'}`} between tellings —
        named steel only, one piece from any one kit, and nothing comes down off that wall until you are strong enough to carry it.
        What you hand her is hers for the rest of this telling.
      </p>

      {notice && <p className="subtitle vault-notice">{notice}</p>}

      <div className="vault-wall">
        {Array.from({ length: MAX_VAULT_SLOTS }).map((_, i) => {
          const entry = meta.vault[i];
          const owned = i < meta.vaultSlots;

          if (!owned) {
            const isNext = i === meta.vaultSlots;
            const cost = VAULT_COST_AT(i);
            return (
              <div className={`vault-slot vault-slot-locked${isNext ? ' vault-slot-next' : ''}`} key={i}>
                <span className="vault-slot-label">Bare hook</span>
                <p className="affix-line">
                  {isNext
                    ? 'There is room here, and she has not said no. The Chronicler settles what it costs.'
                    : 'Further along the wall. Not yet spoken for.'}
                </p>
                <button
                  type="button"
                  className="btn small"
                  disabled={!isNext || meta.verses < cost}
                  onClick={() => {
                    sfx('uiClick');
                    const updated = buyVaultSlot();
                    if (updated) {
                      setMeta(updated);
                      setNotice('She clears a hook, and does not ask what for.');
                    } else setNotice('Not enough verses. The Chronicler does not extend credit.');
                  }}
                >
                  Claim the hook · ✒️ {cost}
                </button>
                {isNext && meta.verses < cost && <span className="affix-line vault-short">You hold {meta.verses}.</span>}
              </div>
            );
          }

          if (!entry) {
            return (
              <div className="vault-slot vault-slot-empty" key={i}>
                <span className="vault-slot-label">Empty hook</span>
                <p className="affix-line">Yours, and holding nothing. Hand her something named and it waits here.</p>
              </div>
            );
          }

          const liftable = canLift(entry.item, player.level);
          const set = setOfItem(entry.item);
          return (
            <div className="vault-slot vault-slot-filled" key={i}>
              <ItemLine item={entry.item} iconSize={44} />
              <span className="affix-line vault-since">
                Left in the {entry.telling === meta.telling ? 'present telling' : `${entry.telling}${ordinalSuffix(entry.telling)} telling`}
                {set ? ` · ${set.name}` : ''}
              </span>
              <button
                type="button"
                className="btn small primary"
                disabled={!liftable}
                onClick={() => {
                  sfx('uiClick');
                  const taken = withdrawFromVault(entry.item.uid);
                  if (!taken) {
                    setNotice('It is not on the wall any more.');
                    setMeta(loadTellings());
                    return;
                  }
                  setMeta(taken.meta);
                  setNotice(null);
                  dispatch({ type: 'VAULT_WITHDRAW', item: taken.item });
                }}
              >
                {liftable ? 'Take it down' : `Come back at level ${entry.item.ilvl}`}
              </button>
              {!liftable && (
                <span className="affix-line vault-short">
                  "You'd wear it badly and I'd have made it worse." Level {player.level} of {entry.item.ilvl}.
                </span>
              )}
            </div>
          );
        })}
      </div>

      {meta.vaultSlots > 0 && (
        <>
          <h3 className="svc-subsection">Hand something over</h3>
          {bankable.length === 0 ? (
            <p className="subtitle">Nothing in your bag is worth a place on that wall. She only keeps named steel.</p>
          ) : (
            <div className="option-list">
              {bankable.map((item) => {
                const refusal = vaultRejection(meta, item);
                return (
                  <div className="item-row" key={item.uid}>
                    <div className="item-desc">
                      <ItemLine item={item} showAffixes={false} iconSize={36} />
                      {refusal && <div className="affix-line vault-refusal">{refusal}</div>}
                    </div>
                    <button
                      type="button"
                      className="btn small"
                      disabled={!!refusal}
                      onClick={() => {
                        sfx('uiClick');
                        const updated = depositToVault(item);
                        if (!updated) {
                          setNotice(vaultRejection(loadTellings(), item) ?? 'She will not take it.');
                          return;
                        }
                        setMeta(updated);
                        setNotice(null);
                        dispatch({ type: 'VAULT_DEPOSIT', uid: item.uid });
                      }}
                    >
                      Leave it with her
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ================= Recast ================= */}
      <h2 className="svc-section">Recast</h2>
      <p className="subtitle" style={{ margin: '0 0 10px' }}>
        {recastable.length === 0
          ? 'She can only name a piece from a kit you have already begun. Bring her one and she will tell you what is missing from it.'
          : `She knows the shape of ${recastable.length} ${recastable.length === 1 ? 'piece' : 'pieces'} you are missing. Give her named steel you are not using and the fire does the rest — which one comes back out is not up to either of you.`}
      </p>
      {recastable.length > 0 && (
        <div className="option-list">
          {bankable.length === 0 && <p className="subtitle">You are carrying no spare named steel to give her.</p>}
          {bankable.map((item) => (
            <div className="item-row" key={`recast-${item.uid}`}>
              <div className="item-desc">
                <ItemLine item={item} showAffixes={false} iconSize={36} />
              </div>
              <div className="svc-buy">
                <span className="price-chip">☉ {recastPrice}g</span>
                <button
                  type="button"
                  className="btn small"
                  disabled={player.gold < recastPrice}
                  onClick={() =>
                    guard.ask({
                      title: `Put ${item.name} into the fire?`,
                      detail: `Grude melts it down for ${recastPrice} gold and names a piece back at random — which one is not up to either of you. ${item.name} does not survive the forge. This cannot be undone.`,
                      confirmLabel: 'Into the fire',
                      perform: () => {
                        sfx('gold');
                        dispatch({ type: 'RECAST_SET_PIECE', uid: item.uid });
                      },
                    })
                  }
                >
                  Into the fire
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="svc-section">Accessories</h2>
      <div className="forge-plates">
        <div className={`forge-plate${player.gold < charmCost ? ' cant' : ''}`}>
          <span className="svc-plate">🧿</span>
          <div className="forge-plate-body">
            <div className="forge-plate-name">Forge a charm</div>
            <div className="affix-line">A trinket for a monster to wear. Two blessings, minimum. No refunds, no promises.</div>
          </div>
          <div className="svc-buy">
            <span className="price-chip">☉ {charmCost}g</span>
            <button
              className="btn small primary"
              disabled={player.gold < charmCost}
              onClick={() => {
                sfx('gold');
                dispatch({ type: 'FORGE_CHARM' });
              }}
            >
              Forge
            </button>
          </div>
        </div>

        <div className={`forge-plate${player.gold < trinketCost ? ' cant' : ''}`}>
          <span className="svc-plate">🧿</span>
          <div className="forge-plate-body">
            <div className="forge-plate-name">Forge a trinket</div>
            <div className="affix-line">A monster's second accessory. Two blessings or three, if the metal is willing.</div>
          </div>
          <div className="svc-buy">
            <span className="price-chip">☉ {trinketCost}g</span>
            <button
              className="btn small primary"
              disabled={player.gold < trinketCost}
              onClick={() => {
                sfx('gold');
                dispatch({ type: 'FORGE_TRINKET' });
              }}
            >
              Forge
            </button>
          </div>
        </div>
      </div>

      <h2 className="svc-section">Reforge</h2>
      <p className="subtitle" style={{ margin: '0 0 10px' }}>
        Reforging improves ONE copy of a card at a time. Monster cards sharpen with their monster instead.
      </p>
      <div className="deck-grid">
        {ids.map((id) => {
          const card = getCard(id);
          if (!card) return null;
          const copies = all.filter((x) => x === id).length;
          const done = player.upgradedCounts[id] ?? 0;
          const cost = BALANCE.upgradeCosts[card.rarity] ?? 100;
          return (
            <div key={id} className="deck-cell">
              <CardView card={card} hero={player} width={128} upgraded={done > 0} />
              <span className="pill">
                {done}/{copies} reforged
              </span>
              {done < copies && (
                <button
                  className="btn small"
                  disabled={player.gold < cost}
                  onClick={() => {
                    sfx('gold');
                    dispatch({ type: 'UPGRADE_CARD', cardId: id });
                  }}
                >
                  Reforge one · {cost}g
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Back
        </button>
      </div>
      {guard.overlay}
    </div>
  );
}

/** Verse price of the i-th hook, read from the vault's own cost table. */
function VAULT_COST_AT(i: number): number {
  return VAULT_SLOT_COSTS[i] ?? VAULT_SLOT_COSTS[VAULT_SLOT_COSTS.length - 1];
}

function ordinalSuffix(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}
