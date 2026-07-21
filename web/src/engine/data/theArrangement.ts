// The Arrangement — the canon that ties the Lantern, the Dark, and taming into
// one system. Named at last (v12); the story always implied it (see story.ts
// chapter 4: "nothing batters down four doors to get into a house on fire")
// and the covenant assumed it (covenantLore.ts). Written in Everdusk's dry,
// record-keeper voice. Read as a codex on the character screen and the stable.

export interface CodexEntry {
  id: string;
  title: string;
  paragraphs: string[];
}

export const THE_ARRANGEMENT: CodexEntry = {
  id: 'arrangement',
  title: 'The Arrangement',
  paragraphs: [
    'Everdusk is built on a threshold, the way some towns are built on a river. Above is the dusk — the one hour that never finishes, held there on purpose. Below, past the gate no mason will claim, is the Deep Dark: not a place so much as a hunger, and the thing the knocking comes from. It was never sealed. It was only ever put to sleep, under light gathered in one place and kept there.',
    'That is what the Last Lantern is for. Not to be looked at. To hold the dusk exactly where it is. Keep the dusk, and the Dark stays asleep. Let the dusk fall all the way to true night — let the light gutter out — and the thing beneath the town wakes up hungry, and there is no ledger entry for what happens after.',
    'The monsters were never what the light kept out. This is the part the old accounts get backwards, and the part that costs people. The beasts live in the gates — the long country between the Dark below and the town above — and every one of them you meet climbing up through it is running from the same thing you are. A frightened creature with its back to a wall fights you. That is the wild monster. It is not guarding the dark. It has been in the dark far too long, and it wants out, and it does not yet know you are a door and not a wall.',
    'So to tame is to bring one the rest of the way up. To give it a name and a place is to walk it across the threshold, out of the gates and into the kept light, where a named thing can rest. That is why a beast born in the wild dark can live in a stable in a lit town, and why the stable was never once called a cage in three hundred years of records. The stable is the far side of the door.',
    'And the dusk counts it. A name given is a promise kept, and the Lantern feeds on kept promises the way it feeds on the orbs — quietly, without receipts. Which means the tamer’s work and the lamp-keeper’s work turn out to be the same work, done at different scales. You are not collecting monsters. You are pulling them out of the night, one name at a time, and every name you give holds the dark off a little longer.',
  ],
};
