# -*- coding: utf-8 -*-
"""Fix truncated voice descriptions + regenerate audition clips with eleven_v3."""
import json, os, subprocess, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = open(os.path.join(HERE, '.elevenlabs.key'), encoding='utf8').read().strip()
VOICEDIR = os.path.join(HERE, 'public', 'audio', 'voices')
VMAP = json.load(open(os.path.join(HERE, 'public', 'audio', 'npc_voices.json')))

FULL = {
    'dovey': ("A middle-aged woman with a warm, gravel-edged voice, dry matronly humor, unhurried and weathered, like a village innkeeper who has seen everything.",
              "Sit anywhere that holds you, friend. The ale is honest and the roof mostly agrees to stay."),
    'bram': ("An older man, gruff and clipped, with weary military authority, low and flat, worn down by too many quiet nights on watch.",
             "State your business. If it's monsters, state it further from my gate. The watch is four grandfathers and a dog."),
    'maribel': ("A very old woman, soft and thin-voiced, gentle and grief-worn, kind but frail, speaking slowly with long pauses.",
                "The stable has not had a heartbeat in it since my husband passed. Tame one, would you? Let the straw mean something again."),
    'ott': ("A middle-aged man with a slow, earthy rumble, calm and a little rough, an unhurried stablemaster who smells of hay and leather.",
            "Easy now. The beasts can smell a hurry on you, and they don't care for it. Give me your hand, slow."),
    'kess': ("A young woman, quick and cocky, bright with a sharp mocking edge, confident and a little dangerous.",
             "So you're the one everyone's whispering about. Cute. Come find me in the gates when you're ready to lose something."),
    'casque': ("A middle-aged man, hushed and reverent, resonant and calm, a hooded friar who speaks as though every word were a small prayer.",
               "Peace, traveler. The dark is only the dusk that forgot itself. The Lantern keeps its watch, and so do we."),
    'rowan': ("An ancient person, deep and slow, wise and faintly quavering, a village elder who has outlived everyone who remembers why.",
              "I have seen four dimmings and named three of them wrong. Sit with an old fool a while."),
    'fennick': ("A middle-aged man, dry and deadpan, hollow and flat, a gravedigger who finds the whole grim business quietly funny.",
                "Plenty of room still. You'd be surprised how many folk march into the dark and forget to come back for the paperwork."),
    'sess': ("A young person, bright and eager, slightly breathless with hope, a lamplighter who still believes the flame can be saved.",
             "Did you see it? The Lantern stood a little taller tonight, I swear it did. One more orb. Maybe two."),
}

def edit_description(vid, name, desc):
    subprocess.run(['curl', '-s', '-o', os.devnull, '-X', 'POST',
                    f'https://api.elevenlabs.io/v1/voices/{vid}/edit',
                    '-H', f'xi-api-key: {KEY}', '-F', f'name={name}', '-F', f'description={desc}'],
                   check=True)

def tts_v3(vid, text, dst):
    body = json.dumps({'text': text, 'model_id': 'eleven_v3'}).encode()
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}', data=body,
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        open(dst, 'wb').write(r.read())

for npc, (desc, sample) in FULL.items():
    vid = VMAP[npc]
    edit_description(vid, f'Everdusk {npc.capitalize()}', desc)
    tts_v3(vid, sample, os.path.join(VOICEDIR, f'{npc}_v3.mp3'))
    print(f'OK {npc:9s} desc fixed + v3 sample ({os.path.getsize(os.path.join(VOICEDIR, npc+"_v3.mp3"))//1024}KB)')
print('done')
