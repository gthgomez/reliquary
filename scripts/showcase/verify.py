#!/usr/bin/env python3
"""Validate showcase media, capture provenance, canonical gallery and local links."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import struct
import subprocess
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/showcase'


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


class Images(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []
    def handle_starttag(self, tag, attrs):
        if tag == 'img':
            self.sources.append(dict(attrs)['src'])


def digest(path):
    return {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def main():
    capture = json.loads((OUT / 'capture.json').read_text())
    check(capture['failure'] is None, 'Capture recorded a failure')
    check(not capture['pageErrors'] and not capture['assetHttpErrors'], 'Browser/asset errors were recorded')
    check(capture['debugStateMutation'] is False, 'Capture used debug state mutation')
    required_events = {'fresh-game', 'starter-bound', 'wild-encounter', 'binding-attempt', 'party', 'completed'}
    check(required_events <= {e['event'] for e in capture['events']}, 'Required genuine scenes are missing')
    check(45 <= capture['durationSeconds'] <= 90, 'Video must be 45–90 seconds')
    # Verify that capture source paths still match the recorded game revision.
    subprocess.run(['git', 'diff', '--exit-code', capture['sourceRevision'], '--',
                    'src/game', 'public/game', 'package.json', 'package-lock.json', 'vite.config.ts'],
                   cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    for name, expected in capture['media'].items():
        check(digest(OUT / name) == expected, f'Original captured bytes changed: {name}')
    for name in ('exploration.png', 'starters.png', 'battle.png', 'party.png'):
        raw = (OUT / name).read_bytes()
        check(raw[:8] == b'\x89PNG\r\n\x1a\n', f'Invalid PNG: {name}')
        check(struct.unpack('>II', raw[16:24]) == (1280, 800), f'Wrong screenshot size: {name}')
    probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams',
                                               '-of', 'json', str(OUT / 'gameplay.mp4')]))
    check(len(probe['streams']) == 1, 'Recording must have one silent video stream')
    video = probe['streams'][0]
    check(video['codec_name'] == 'h264', 'Expected H.264 video')
    check((video['width'], video['height']) == (1280, 800), 'Wrong video resolution')
    check(int(video['nb_frames']) == capture['frames'], 'Video frame count differs from capture')
    check(abs(float(probe['format']['duration']) - capture['durationSeconds']) < .11, 'Video duration differs')
    subprocess.run(['ffmpeg', '-v', 'error', '-i', str(OUT / 'gameplay.mp4'), '-f', 'null', '-'], check=True)
    check((OUT / 'preview.gif').read_bytes()[:6] in (b'GIF89a', b'GIF87a'), 'Invalid GIF')
    source = 'import {SPECIES} from "./src/game/content.ts";console.log(JSON.stringify(Object.keys(SPECIES)))'
    species = json.loads(subprocess.check_output(['node', '--experimental-strip-types', '--input-type=module',
                                                 '-e', source], cwd=ROOT))
    gallery = (OUT / 'CREATURES.md').read_text()
    images = Images()
    images.feed(gallery)
    check(images.sources == [f'../../public/game/sprites/{id}.png' for id in species], 'Gallery differs from canonical species')
    check(len(species) == 21, 'Update showcase copy for changed species count')
    files = [ROOT / 'README.md', OUT / 'README.md', OUT / 'CREATURES.md']
    for file in files:
        text = file.read_text()
        sources = Images()
        sources.feed(text)
        links = re.findall(r'!?\[[^\]]*\]\(([^)]+)\)', text) + sources.sources
        for link in links:
            url = urlparse(link)
            if url.scheme or link.startswith('#'):
                continue
            target = (file.parent / unquote(url.path)).resolve()
            # This invocation emits the manifest after validating the inputs.
            if target != OUT / 'media.json':
                check(target.is_file(), f'Broken local link in {file.name}: {link}')
    names = ['gameplay.mp4', 'preview.gif', 'exploration.png', 'starters.png', 'battle.png', 'party.png', 'capture.json']
    media = {name: digest(OUT / name) for name in names}
    check(sum(item['bytes'] for item in media.values()) < 5_000_000, 'Showcase media exceeds 5 MB budget')
    manifest = {'gameRevision': capture['sourceRevision'], 'media': media,
                'publicationScripts': {name: digest(ROOT / 'scripts/showcase' / name)
                                       for name in ('capture.py', 'gallery.mjs', 'verify.py')}}
    (OUT / 'media.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'PASS: {capture["durationSeconds"]}s real capture, 4 screenshots, {len(species)} creature cards, '
          f'valid local links, H.264 decode; {sum(item["bytes"] for item in media.values()):,} media bytes.')


if __name__ == '__main__':
    main()
