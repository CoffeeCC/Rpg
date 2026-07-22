import { useState } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import type { CardDef } from '../engine/types';
import { CLASS_DECKS, RACE_CARDS, REWARD_POOLS, SPECIES_CARDS, TAME_CARD_ID, getCard } from '../engine/data/cards';
import { SPECIES } from '../engine/data/species';
import { CardView } from './CardView';
import { CardDetailOverlay } from './CardDetailOverlay';
import { Icon } from './Icon';
import { play as sfx } from '../platform/sfx';

interface CodexEntry {
  card: CardDef;
  owned: boolean;
}

function dedupeCards(ids: string[]): CardDef[] {
  const seen = new Set<string>();
  const out: CardDef[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const card = getCard(id);
    if (card) out.push(card);
  }
  return out;
}

/** v17: a full gallery of every card in the game — not just what's currently
 * in your deck (that's DeckScreen). Cards you don't currently have access to
 * render greyed out but stay fully inspectable; nothing here is spoiler-hidden,
 * it's a compendium, not an unlock tracker. */
export function CardCodexScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const [inspect, setInspect] = useState<CodexEntry | null>(null);
  const ownedSpecies = new Set([...state.party, ...state.stable].map((m) => m.speciesId));

  const cell = (entry: CodexEntry) => (
    <button
      type="button"
      key={entry.card.id}
      className={`deck-cell codex-cell ${entry.owned ? '' : 'codex-locked'}`}
      onClick={() => {
        sfx('uiClick');
        setInspect(entry);
      }}
    >
      <CardView card={entry.card} hero={player} width={128} upgraded={(player.upgradedCounts[entry.card.id] ?? 0) > 0} />
    </button>
  );

  const section = (title: string, entries: CodexEntry[]) =>
    entries.length > 0 && (
      <>
        <h2 className="title" style={{ fontSize: '0.95rem', marginTop: 16 }}>
          {title}
        </h2>
        <div className="deck-grid">{entries.map(cell)}</div>
      </>
    );

  const starterSections = (Object.keys(CLASS_DECKS) as (keyof typeof CLASS_DECKS)[]).map((className) => ({
    title: `${className} Starters`,
    entries: dedupeCards(CLASS_DECKS[className]).map((card) => ({ card, owned: player.className === className })),
  }));

  const raceSections = (Object.keys(RACE_CARDS) as (keyof typeof RACE_CARDS)[]).map((race) => ({
    title: `${race} Blood`,
    entries: dedupeCards(RACE_CARDS[race]).map((card) => ({ card, owned: player.race === race })),
  }));

  const speciesIds = Object.keys(SPECIES_CARDS).sort((a, b) => (SPECIES[a]?.name ?? a).localeCompare(SPECIES[b]?.name ?? b));
  const speciesSections = speciesIds.map((speciesId) => {
    const species = SPECIES[speciesId];
    return {
      title: species ? `${species.emoji} ${species.name}` : speciesId,
      entries: dedupeCards(SPECIES_CARDS[speciesId]).map((card) => ({ card, owned: ownedSpecies.has(speciesId) })),
    };
  });

  const universalEntries = dedupeCards([TAME_CARD_ID]).map((card) => ({ card, owned: true }));

  const rewardSections = (['common', 'uncommon', 'rare'] as const).map((rarity) => ({
    title: `Reward Pool · ${rarity[0].toUpperCase()}${rarity.slice(1)}`,
    entries: dedupeCards(REWARD_POOLS[rarity]).map((card) => ({ card, owned: state.expeditionExtras.includes(card.id) })),
  }));

  return (
    <>
      <div className="panel">
        <h1 className="title title-with-icon">
          <Icon name="deck" size={26} emoji="" /> Card Codex
        </h1>
        <p className="subtitle">Every card in Everdusk. Ones you don't currently have access to show dimmed — click any card to inspect it regardless.</p>

        {section('Universal', universalEntries)}
        {starterSections.map((s) => (
          <div key={s.title}>{section(s.title, s.entries)}</div>
        ))}
        {raceSections.map((s) => (
          <div key={s.title}>{section(s.title, s.entries)}</div>
        ))}
        {rewardSections.map((s) => (
          <div key={s.title}>{section(s.title, s.entries)}</div>
        ))}
        {speciesSections.map((s) => (
          <div key={s.title}>{section(s.title, s.entries)}</div>
        ))}

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
            Back
          </button>
        </div>
      </div>

      {/* Rendered as a sibling of .panel, not nested in it — this screen's
          .panel is much taller than the viewport (every card in the game),
          and .panel carries a resting transform (see App.css) that makes it
          a CSS containing block for position:fixed descendants. Nested
          inside it, the overlay would size itself to the full scroll height
          of the panel instead of the viewport and could render far off
          the visible page. Every other (short) screen has this same latent
          issue, just never tall enough to expose it. */}
      {inspect && (
        <CardDetailOverlay
          card={inspect.card}
          hero={player}
          count={0}
          upgraded={(player.upgradedCounts[inspect.card.id] ?? 0) > 0}
          onClose={() => setInspect(null)}
        />
      )}
    </>
  );
}
