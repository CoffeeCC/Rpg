# -*- coding: utf-8 -*-
"""Design custom ElevenLabs voices for the tavern NPCs. One-time, dev-only.
Creates a voice per NPC, saves it to the library, stores the voice_id, and
writes all 3 preview clips per NPC for auditioning."""
import base64, json, os, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = open(os.path.join(HERE, '.elevenlabs.key'), encoding='utf8').read().strip()
VOICEDIR = os.path.join(HERE, 'public', 'audio', 'voices')
os.makedirs(VOICEDIR, exist_ok=True)

# Dovey already created in testing:
PREMADE = {'dovey': 'cuHBY3eS4BI67Cb6vZco'}

NPCS = {
    'bram': ("An older man, gruff and clipped, with weary military authority, low and flat, worn down by too many quiet nights on watch.",
             "State your business. If your business is monsters, state it somewhere further from my gate. The watch is four grandfathers and a dog, and I intend to keep every one of them bored."),
    'maribel': ("A very old woman, soft and thin-voiced, gentle and grief-worn, kind but frail, speaking slowly with long pauses.",
                "My husband kept monsters, once. The stable has not had a heartbeat in it since he passed, and the quiet is the loudest thing in my house. Tame one, would you? Let the straw mean something again."),
    'ott': ("A middle-aged man with a slow, earthy rumble, calm and a little rough, an unhurried stablemaster who smells of hay and leather.",
            "Easy now. The beasts can smell a hurry on you, and they do not care for it. Give me your hand slow, palm open, nothing to prove. There. That is the whole trick of it, in the end."),
    'kess': ("A young woman, quick and cocky, bright with a sharp mocking edge, confident and a little dangerous.",
             "So you are the one everyone keeps whispering about. Cute. Come find me out in the gates when you think you are ready to lose something you actually care about. I will go easy. Once."),
    'casque': ("A middle-aged man, hushed and reverent, resonant and calm, a hooded friar who speaks as though every word were a small prayer.",
               "Peace, traveler. The dark is only the dusk that forgot itself. Kneel a moment, if your knees still bend. The Lantern keeps its watch, and so, tonight, do we. Go gently into the gates."),
    'rowan': ("An ancient person, deep and slow, wise and faintly quavering, a village elder who has outlived everyone who remembers why.",
              "I have seen four dimmings and named three of them wrong. Sit with an old fool a while. The young are always in such a hurry to be afraid, and there is no rushing a thing like the dark."),
    'fennick': ("A middle-aged man, dry and deadpan, hollow and flat, a gravedigger who finds the whole grim business quietly funny.",
                "Plenty of room still, if you are asking. I keep it tidy. You would be surprised how many folk march off into the dark and forget to come back for the paperwork. I am patient. I have to be."),
    'sess': ("A young person, bright and eager, slightly breathless with hope, a lamplighter who still believes the flame can be saved.",
             "Did you see it? The Lantern stood a little taller tonight, I swear that it did. One more orb. Maybe two. I keep the wicks trimmed and the oil close, just in case tonight is the night it holds."),
}

def post(path, body):
    req = urllib.request.Request('https://api.elevenlabs.io' + path, data=json.dumps(body).encode(),
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

def make(npc, desc, text):
    prev = post('/v1/text-to-voice/create-previews', {'voice_description': desc, 'text': text})
    previews = prev['previews']
    for i, p in enumerate(previews):
        open(os.path.join(VOICEDIR, f'{npc}_{i+1}.mp3'), 'wb').write(base64.b64decode(p['audio_base_64']))
    gid = previews[0]['generated_voice_id']
    saved = post('/v1/text-to-voice/create-voice-from-preview',
                 {'voice_name': f'Everdusk {npc.capitalize()}', 'voice_description': desc[:100], 'generated_voice_id': gid})
    return saved['voice_id'], len(previews)

if __name__ == '__main__':
    mapping = dict(PREMADE)
    for npc, (desc, text) in NPCS.items():
        try:
            vid, n = make(npc, desc, text)
            mapping[npc] = vid
            print(f'OK   {npc:9s} -> {vid} ({n} previews saved)')
        except urllib.error.HTTPError as e:
            print(f'FAIL {npc:9s} {e.code} {e.read()[:160].decode("utf8","replace")}')
        time.sleep(1)
    open(os.path.join(HERE, 'public', 'audio', 'npc_voices.json'), 'w').write(json.dumps(mapping, indent=1))
    print('\nvoice map:', json.dumps(mapping, indent=1))
