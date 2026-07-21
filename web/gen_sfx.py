# -*- coding: utf-8 -*-
"""Generate Everdusk combat/UI sound effects via ElevenLabs. One-time, dev-only.
Key read from .elevenlabs.key (gitignored). Output: public/audio/sfx/<name>.mp3."""
import json, os, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = open(os.path.join(HERE, '.elevenlabs.key'), encoding='utf8').read().strip()
OUT = os.path.join(HERE, 'public', 'audio', 'sfx')
os.makedirs(OUT, exist_ok=True)

# name: (prompt, duration_seconds). Dark-fantasy game SFX, short and punchy.
SFX = {
    'slash':       ('a sharp steel sword slashing through the air, quick metallic whoosh, single swing', 0.7),
    'pierce':      ('a sharp dagger thrust piercing flesh, quick wet stab, short', 0.6),
    'fire':        ('a burst of flame igniting, a fireball whooshing and roaring, magical fire spell', 1.2),
    'frost':       ('ice crystals forming and shattering, a freezing frost magic shimmer, cold and glassy', 1.2),
    'bolt':        ('a sharp crackle of a lightning bolt, electric zap, quick thunderclap', 0.8),
    'dark':        ('ominous dark shadow magic swelling, a low demonic whoosh, cursed and evil', 1.3),
    'holy':        ('a bright divine holy chime, radiant angelic light shimmer, sacred and warm', 1.3),
    'hit':         ('a solid blunt physical impact hitting armor, a heavy thud, short', 0.5),
    'hurt':        ('a heavy painful body blow landing, deep armored thud with a low crunch', 0.6),
    'block':       ('a metal shield blocking a blow, a sharp clang and parry of steel', 0.6),
    'heal':        ('a gentle magical healing shimmer, soft restorative chime, warm and soothing', 1.0),
    'ko':          ('a creature collapsing and dying, a final heavy thud with a fading groan', 1.2),
    'tameSuccess': ('a warm magical sparkle of a creature being befriended, gentle rising chime, hopeful', 1.2),
    'tameFail':    ('a magic spell fizzling and failing, a dull negative fizzle, refusal', 0.8),
    'victory':     ('a short triumphant dark-fantasy victory fanfare, brass and drums, heroic', 2.2),
    'defeat':      ('a somber descending failure tone, mournful low strings, defeat and loss', 2.2),
    'cardPlay':    ('a playing card thrown down onto a wooden table, quick paper snap and whoosh', 0.6),
    'cardHover':   ('a very short soft paper card flick, subtle quick tick', 0.5),
    'draw':        ('a card being drawn and sliding off a deck, quick soft paper slide', 0.5),
    'endTurn':     ('a soft low wooden turn-passing thump, a muted drum tap, brief', 0.6),
    'gold':        ('gold coins jingling and clinking together, a quick treasure pickup', 0.7),
    'uiClick':     ('a soft muted dark-fantasy UI button click, a subtle wooden tick', 0.5),
}

def generate(name, prompt, dur):
    body = json.dumps({'text': prompt, 'duration_seconds': dur, 'prompt_influence': 0.5}).encode()
    req = urllib.request.Request(
        'https://api.elevenlabs.io/v1/sound-generation',
        data=body,
        headers={'xi-api-key': KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'},
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        return False, '%d %s' % (e.code, e.read()[:160].decode('utf8', 'replace'))
    if not data.startswith(b'ID3') and data[:2] != b'\xff\xfb':
        return False, 'not-mp3 (%d bytes)' % len(data)
    open(os.path.join(OUT, name + '.mp3'), 'wb').write(data)
    return True, '%d bytes' % len(data)

if __name__ == '__main__':
    ok = 0
    for name, (prompt, dur) in SFX.items():
        success, info = generate(name, prompt, dur)
        print(('OK  ' if success else 'FAIL') + ' %-13s %s' % (name, info))
        if success:
            ok += 1
        time.sleep(0.8)
    print('\n%d/%d generated' % (ok, len(SFX)))
