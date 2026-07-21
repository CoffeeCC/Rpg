# -*- coding: utf-8 -*-
"""Replace each NPC's take-1 library voice with their take-3 clip (Paul's pick).
Deletes the old voice, clones the take-3 audio, regenerates a v3 audition sample."""
import json, os, subprocess, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = open(os.path.join(HERE, '.elevenlabs.key'), encoding='utf8').read().strip()
VOICEDIR = os.path.join(HERE, 'public', 'audio', 'voices')
MAPPATH = os.path.join(HERE, 'public', 'audio', 'npc_voices.json')
vmap = json.load(open(MAPPATH))

DESC = {
    'dovey': "A middle-aged woman with a warm, gravel-edged voice, dry matronly humor, unhurried and weathered, like a village innkeeper who has seen everything.",
    'maribel': "A very old woman, soft and thin-voiced, gentle and grief-worn, kind but frail, the town's keeper of the lost who holds the things the dead leave behind.",
    'ott': "A middle-aged man with a slow, earthy rumble, calm and a little rough, an unhurried stablemaster who smells of hay and leather.",
    'kess': "A young woman, quick and cocky, bright with a sharp mocking edge, confident and a little dangerous.",
    'casque': "A middle-aged man, hushed and reverent, resonant and calm, a hooded friar who speaks as though every word were a small prayer.",
    'rowan': "An ancient person, deep and slow, wise and faintly quavering, a village elder who has outlived everyone who remembers why.",
    'fennick': "A middle-aged man, dry and deadpan, hollow and flat, a gravedigger who finds the whole grim business quietly funny.",
    'sess': "A young person, bright and eager, slightly breathless with hope, a lamplighter who still believes the flame can be saved.",
}
SAMPLE = {
    'dovey': "Sit anywhere that holds you, friend. The ale is honest and the roof mostly agrees to stay.",
    'maribel': "Come in, dear. I keep the small things people leave behind. Lately I keep a great many.",
    'ott': "Easy now. The beasts can smell a hurry on you, and they don't care for it. Give me your hand, slow.",
    'kess': "So you're the one everyone's whispering about. Cute. Come find me in the gates when you're ready to lose something.",
    'casque': "Peace, traveler. The dark is only the dusk that forgot itself. The Lantern keeps its watch, and so do we.",
    'rowan': "I have seen four dimmings and named three of them wrong. Sit with an old fool a while.",
    'fennick': "Plenty of room still. You'd be surprised how many folk march into the dark and forget to come back for the paperwork.",
    'sess': "Did you see it? The Lantern stood a little taller tonight, I swear it did. One more orb. Maybe two.",
}

def delete_voice(vid):
    subprocess.run(['curl', '-s', '-o', os.devnull, '-X', 'DELETE',
                    f'https://api.elevenlabs.io/v1/voices/{vid}', '-H', f'xi-api-key: {KEY}'], check=True)

def clone(name, audio, desc):
    out = subprocess.run(['curl', '-s', '-X', 'POST', 'https://api.elevenlabs.io/v1/voices/add',
                          '-H', f'xi-api-key: {KEY}', '-F', f'name={name}',
                          '-F', f'files=@{audio}', '-F', f'description={desc}'],
                         check=True, capture_output=True, text=True)
    return json.loads(out.stdout)['voice_id']

def tts_v3(vid, text, dst):
    body = json.dumps({'text': text, 'model_id': 'eleven_v3'}).encode()
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}', data=body,
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        open(dst, 'wb').write(r.read())

# Bram already swapped in the test:
vmap['bram'] = 'uJS8tybgqcf3r4VKzypw'

for npc in ['dovey', 'maribel', 'ott', 'kess', 'casque', 'rowan', 'fennick', 'sess']:
    old = vmap[npc]
    delete_voice(old)
    new = clone(f'Everdusk {npc.capitalize()}', os.path.join(VOICEDIR, f'{npc}_3.mp3'), DESC[npc])
    vmap[npc] = new
    print(f'OK {npc:9s} {old} -> {new} (take 3)')

# Refresh v3 audition samples for all 9 from the new voices
for npc in ['dovey', 'bram', 'maribel', 'ott', 'kess', 'casque', 'rowan', 'fennick', 'sess']:
    tts_v3(vmap[npc], SAMPLE[npc], os.path.join(VOICEDIR, f'{npc}_v3.mp3'))
    print(f'   {npc} v3 sample refreshed')

json.dump(vmap, open(MAPPATH, 'w'), indent=1)
print('\nfinal voice map:', json.dumps(vmap, indent=1))
