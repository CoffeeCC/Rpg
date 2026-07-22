# -*- coding: utf-8 -*-
"""One-off: redesign Sess's voice to match her actual dialogue (steady, dry,
warm veteran lamplighter) instead of the old 'young and eager' brief, then
re-voice all her existing greeting lines with it."""
import base64, json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = open(os.path.join(HERE, '.elevenlabs.key'), encoding='utf8').read().strip()
VOICEDIR = os.path.join(HERE, 'public', 'audio', 'voices')
LINEDIR = os.path.join(HERE, 'public', 'audio', 'lines')
os.makedirs(VOICEDIR, exist_ok=True)
os.makedirs(LINEDIR, exist_ok=True)

DESC = ("A middle-aged lamplighter, steady and dry, warm underneath a wry deadpan delivery, "
        "quietly devoted to a small unglamorous job done well for years, speaking with the calm "
        "of someone completely unhurried and unbothered by the dark.")
PREVIEW_TEXT = "Forty-one lamps on my round, and the dark leans on every one of them. Walk in the middle of the street."

LINES = [
    "Forty-one lamps on my round, and the dark leans on every one of them. Walk in the middle of the street.",
    "I light them at dusk and I do not look at what the light pushes back. You should not either.",
    "The lamps burn longer since the first orb. Same oil. I keep records. Same oil.",
    "One orb home, and lamp thirty-three relit itself. I have decided to be delighted instead of terrified.",
    "The dark leans lighter these nights. A lamplighter can tell. It is most of the job.",
    "Three orbs, and I trimmed the wicks short for the first time in years. The flames stand up straight now, like they are proud.",
    "Children follow my round to watch the lamps catch. There used to be no children out at dusk at all.",
    "Four orbs, and my round feels like a lap of honor. The lamps hardly need me. I go anyway. We are old friends.",
    "The dawn does my job better than I ever did, and I have never been happier to be beaten.",
    "I will keep lighting them, mind. Tradition. Besides — somebody kept a light for us in the worst of it. Fair is fair.",
]

def post(path, body):
    req = urllib.request.Request('https://api.elevenlabs.io' + path, data=json.dumps(body).encode(),
                                  headers={'xi-api-key': KEY, 'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        print('HTTP ERROR BODY:', e.read().decode('utf8', 'replace'))
        raise

def tts(vid, text, dst):
    body = json.dumps({'text': text, 'model_id': 'eleven_v3'}).encode()
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}', data=body,
                                  headers={'xi-api-key': KEY, 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=120) as r:
        open(dst, 'wb').write(r.read())

print('Designing new Sess voice...')
prev = post('/v1/text-to-voice/create-previews', {'voice_description': DESC, 'text': PREVIEW_TEXT})
previews = prev['previews']
for i, p in enumerate(previews):
    open(os.path.join(VOICEDIR, f'sess_v2_preview_{i+1}.mp3'), 'wb').write(base64.b64decode(p['audio_base_64']))
gid = previews[0]['generated_voice_id']
saved = post('/v1/text-to-voice/create-voice-from-preview',
             {'voice_name': 'Everdusk Sess v2', 'voice_description': DESC[:100], 'generated_voice_id': gid})
vid = saved['voice_id']
print(f'New voice created: {vid} ({len(previews)} previews saved for audition)')

print('Re-voicing all 10 lines...')
for i, line in enumerate(LINES):
    fname = f'sess_{i}.mp3'
    tts(vid, line, os.path.join(LINEDIR, fname))
    print(f'  sess_{i} done ({len(line)} chars)')

vmap = json.load(open(os.path.join(HERE, 'public', 'audio', 'npc_voices.json'), encoding='utf8'))
vmap['sess'] = vid
open(os.path.join(HERE, 'public', 'audio', 'npc_voices.json'), 'w').write(json.dumps(vmap, indent=1))
print(f'\nDone. New sess voice_id: {vid}')
