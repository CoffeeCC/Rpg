# -*- coding: utf-8 -*-
"""Voice every fixed NPC greeting line in that NPC's locked voice (eleven_v3).
Builds src/engine/data/npcLineAudio.ts mapping each line to its clip."""
import json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = open(os.path.join(HERE, '.elevenlabs.key'), encoding='utf8').read().strip()
LINES = json.load(open(os.path.join(HERE, 'public', 'audio', '_greeting_lines.json'), encoding='utf8'))
VMAP = json.load(open(os.path.join(HERE, 'public', 'audio', 'npc_voices.json'), encoding='utf8'))
OUT = os.path.join(HERE, 'public', 'audio', 'lines')
os.makedirs(OUT, exist_ok=True)

def tts(vid, text, dst):
    body = json.dumps({'text': text, 'model_id': 'eleven_v3'}).encode()
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}', data=body,
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        open(dst, 'wb').write(r.read())

manifest = {}
n = 0
for npc in LINES:
    vid = VMAP[npc['npcId']]
    for i, line in enumerate(npc['lines']):
        fname = f"{npc['npcId']}_{i}.mp3"
        tts(vid, line, os.path.join(OUT, fname))
        manifest[f"{npc['npcId']}|{line}"] = f"audio/lines/{fname}"
        n += 1
        print(f"  {npc['npcId']}_{i} ({len(line)} chars)")

ts = "// AUTO-GENERATED: voiced NPC greeting lines (ElevenLabs eleven_v3, per-NPC voice).\n"
ts += "// Key: `${npcId}|${exact line text}`. Rumors are dynamic and stay unvoiced.\n"
ts += "export const NPC_LINE_AUDIO: Record<string, string> = " + json.dumps(manifest, ensure_ascii=False, indent=1) + ";\n"
open(os.path.join(HERE, 'src', 'engine', 'data', 'npcLineAudio.ts'), 'w', encoding='utf8').write(ts)
print(f"\n{n} lines voiced -> npcLineAudio.ts")
