# -*- coding: utf-8 -*-
"""One-off: re-voice Sess's 'extra dialogue' barks with her new voice
(Everdusk Sess v2), since they were originally rendered with the old
'young and eager' voice before it got replaced."""
import json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = open(os.path.join(HERE, '.elevenlabs.key'), encoding='utf8').read().strip()
OUT = os.path.join(HERE, 'public', 'audio', 'lines')
VMAP = json.load(open(os.path.join(HERE, 'public', 'audio', 'npc_voices.json'), encoding='utf8'))
VID = VMAP['sess']

LINES = [
    "Forty-one lamps on my round, and the dark leans on every one.",
    "Walk in the middle of the street. I've earned the right to say that.",
    "The lamp gutters blue some nights. I tell you anyway.",
    "I light them at dusk and try not to look at what pushes back.",
    "Every gate you walk through, I have already lit the way to it.",
    "Stand in the light a second before you go. Costs nothing.",
    "The dark hates being looked at first. So I look first.",
    "Some nights I count who came back more than who went out.",
    "Forty-one lamps, and I have an opinion about every single one.",
]

def tts(vid, text, dst):
    body = json.dumps({'text': text, 'model_id': 'eleven_v3'}).encode()
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}', data=body,
                                  headers={'xi-api-key': KEY, 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        open(dst, 'wb').write(r.read())

for i, line in enumerate(LINES):
    fname = f'extra_sess_{i}.mp3'
    tts(VID, line, os.path.join(OUT, fname))
    print(f'  {fname} done ({len(line)} chars)')
print('done')
