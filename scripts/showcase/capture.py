#!/usr/bin/env python3
"""Record real local gameplay. Requires Python Playwright, Chromium and FFmpeg.

Run npm run build and npm run preview separately. No game state, randomness
or saves are injected. Prefer the built preview to avoid development reloads.
"""
import argparse
import asyncio
from collections import deque
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time
from urllib.parse import urlparse

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
DIRECTIONS = [(0, -1, 'ArrowUp'), (-1, 0, 'ArrowLeft'),
              (1, 0, 'ArrowRight'), (0, 1, 'ArrowDown')]


def content_data():
    source = '''import {MAPS,BLOCKED,ENCOUNTER_TILES} from "./src/game/maps.ts";
import {SPECIES} from "./src/game/content.ts";
console.log(JSON.stringify({maps:MAPS,blocked:[...BLOCKED],encounterTiles:[...ENCOUNTER_TILES],species:SPECIES}));'''
    return json.loads(subprocess.check_output(
        ['node', '--experimental-strip-types', '--input-type=module', '-e', source], cwd=ROOT))


def route(data, map_id, start, goal, starter):
    """Plan legal walking inputs, avoiding unintended map transitions."""
    m = data['maps'][map_id]
    def free(x, y):
        if y < 0 or y >= len(m['ground']) or x < 0 or x >= len(m['ground'][y]):
            return False
        if m['ground'][y][x] in data['blocked']:
            return False
        if (x, y) != goal and any(w['x'] == x and w['y'] == y for w in m['warps']):
            return False
        for o in m['objects']:
            if not o.get('solid') or (starter and o['id'].startswith('st_')):
                continue
            if o['x'] <= x < o['x'] + o['w'] and o['y'] + o['h'] - o['foot'] <= y < o['y'] + o['h']:
                return False
        return not any(n['x'] == x and n['y'] == y for n in m['npcs'])
    queue = deque([(start, [])])
    seen = {start}
    while queue:
        pos, steps = queue.popleft()
        if pos == goal:
            return steps
        for dx, dy, key in DIRECTIONS:
            nxt = (pos[0] + dx, pos[1] + dy)
            if nxt not in seen and free(*nxt):
                seen.add(nxt)
                queue.append((nxt, steps + [(key, nxt)]))
    raise RuntimeError(f'No legal route in {map_id}: {start} -> {goal}')


class Capture:
    def __init__(self, page, data, out):
        self.page, self.data, self.out = page, data, out
        self.starter = False
        self.events = []
        self.started = time.monotonic()
        self.stop = False
        self.frames = 0

    def event(self, name, **detail):
        item = {'seconds': round(time.monotonic() - self.started, 2), 'event': name, **detail}
        self.events.append(item)
        print(json.dumps(item), flush=True)

    async def pos(self):
        # Observation only. Never call warp(), startWild() or setKeys().
        return await self.page.evaluate('window.__controlsTest.getPos()')

    async def screenshot(self, name):
        await self.page.screenshot(path=str(self.out / f'{name}.png'))
        self.event('screenshot', file=f'{name}.png', position=await self.pos())

    async def step(self, key):
        before = await self.pos()
        await self.page.keyboard.down(key)
        try:
            await self.page.wait_for_function('''before => {
              const p = window.__controlsTest.getPos();
              return p.map !== before.map || p.x !== before.x || p.y !== before.y || p.mode !== before.mode;
            }''', arg=before, timeout=1600, polling=10)
        except Exception as err:
            raise RuntimeError(f'Input {key} from {before}; observed {await self.pos()}') from err
        finally:
            await self.page.keyboard.up(key)
        # A warp can finish before the held key starts another walking frame.
        # Wait for real movement to settle, then plan from the observed tile.
        await self.page.wait_for_function('window.__controlsTest.getSpeed() === 0', timeout=1600)

    async def walk(self, x, y, expected_map=None):
        initial = await self.pos()
        for _ in range(160):
            p = await self.pos()
            if p['mode'] == 'battle':
                return
            if p['map'] != initial['map'] or (p['x'], p['y']) == (x, y):
                break
            steps = route(self.data, p['map'], (p['x'], p['y']), (x, y), self.starter)
            await self.step(steps[0][0])
        else:
            raise RuntimeError('Walking exceeded 160 observed steps')
        p = await self.pos()
        if expected_map and p['map'] != expected_map:
            raise RuntimeError(f'Expected {expected_map}, got {p}')

    async def dialogs(self, delay=1.1):
        for _ in range(12):
            if not (await self.pos())['dialog']:
                return
            await asyncio.sleep(delay)
            await self.page.keyboard.press('z')
        raise RuntimeError('Dialogue did not finish')

    async def record(self):
        fps = 10
        proc = await asyncio.create_subprocess_exec(
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe',
            '-vcodec', 'mjpeg', '-framerate', str(fps), '-i', 'pipe:0', '-an',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', str(self.out / 'gameplay.mp4'),
            stdin=asyncio.subprocess.PIPE)
        try:
            while not self.stop:
                frame = await self.page.screenshot(type='jpeg', quality=78)
                due = max(1, int((time.monotonic() - self.started) * fps) - self.frames + 1)
                for _ in range(due):
                    proc.stdin.write(frame)
                    await proc.stdin.drain()
                    self.frames += 1
                await asyncio.sleep(max(0, self.frames / fps - (time.monotonic() - self.started)))
        finally:
            proc.stdin.close()
            await proc.wait()
            if proc.returncode:
                raise RuntimeError(f'FFmpeg exited {proc.returncode}')

    async def journey(self):
        p = self.page
        self.event('title')
        await asyncio.sleep(3)
        await p.get_by_role('button', name='Start', exact=True).click()
        await self.dialogs(1.7)
        self.event('fresh-game', position=await self.pos())
        await self.walk(5, 8, 'elderhall')
        await self.walk(5, 10)
        await self.screenshot('exploration')
        await asyncio.sleep(2)
        await self.walk(0, 10, 'grove')
        await self.walk(5, 6)
        self.event('binding-grove')
        await self.screenshot('starters')
        await asyncio.sleep(3)
        # Face the adjacent Emberkit; the occupied tile prevents movement.
        await p.keyboard.press('ArrowLeft', delay=100)
        await p.keyboard.press('z')
        await self.dialogs(1.5)
        self.starter = True
        save = await p.evaluate('JSON.parse(localStorage.getItem("reliquary.save.v2"))')
        if not save or not save['caught'].get('emberkit'):
            raise RuntimeError('Starter pact not earned through normal interaction')
        self.event('starter-bound', species='emberkit')
        await self.walk(15, 7, 'elderhall')
        await self.walk(10, 0, 'briar_road')
        self.event('briar-road')
        await self.walk(7, 22)
        for i in range(80):
            state = await self.pos()
            if state['mode'] == 'battle':
                break
            await self.walk(6 if i % 2 == 0 else 7, 22)
        else:
            raise RuntimeError('No wild encounter within 80 ordinary grass steps')
        self.event('wild-encounter')
        await self.screenshot('battle')
        await asyncio.sleep(3)
        await p.get_by_role('button', name='Strike', exact=True).click()
        await asyncio.sleep(2.2)
        if await p.get_by_role('button', name='Bind', exact=True).is_visible():
            await p.get_by_role('button', name='Bind', exact=True).click()
            await p.get_by_role('button', name='Common Sigil', exact=False).click()
            self.event('binding-attempt')
            await asyncio.sleep(4)
        else:
            self.event('foe-defeated-before-binding')
        if await p.get_by_role('button', name='Continue', exact=True).is_visible():
            await p.get_by_role('button', name='Continue', exact=True).click()
        elif await p.get_by_role('button', name='Flee', exact=True).is_visible():
            # Failed binding is still shown honestly; leave through normal controls.
            for _ in range(8):
                if (await self.pos())['mode'] != 'battle':
                    break
                if await p.get_by_role('button', name='Flee', exact=True).is_visible():
                    await p.get_by_role('button', name='Flee', exact=True).click()
                elif await p.get_by_role('button', name='Continue', exact=True).is_visible():
                    await p.get_by_role('button', name='Continue', exact=True).click()
                await asyncio.sleep(1.6)
        if (await self.pos())['mode'] != 'world':
            raise RuntimeError(f'Battle did not return to the world: {await self.pos()}')
        await p.keyboard.press('m')
        await p.get_by_role('button', name='Party', exact=True).click()
        await self.screenshot('party')
        self.event('party')
        await asyncio.sleep(4)
        # Keep a concise but readable minimum length, without speeding up gameplay.
        await asyncio.sleep(max(0, 48 - (time.monotonic() - self.started)))
        self.event('completed')


async def main(args):
    parsed = urlparse(args.url)
    if parsed.scheme not in ('http', 'https') or parsed.hostname not in ('127.0.0.1', 'localhost', '::1') or parsed.username or parsed.password:
        raise ValueError('Capture accepts only credential-free loopback HTTP URLs')
    out = Path(args.out).resolve()
    if not out.is_relative_to(ROOT / 'docs' / 'showcase'):
        raise ValueError('Output must be within this repository docs/showcase directory')
    out.mkdir(parents=True, exist_ok=True)
    (out / 'failure.png').unlink(missing_ok=True)
    data = content_data()
    errors, asset_errors = [], []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=args.chromium or shutil.which('chromium'), headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage'])
        context = await browser.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)
        page = await context.new_page()
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.on('response', lambda response: asset_errors.append({'url': response.url, 'status': response.status})
                if '/game/' in response.url and response.status >= 400 else None)
        try:
            response = await page.goto(args.url, wait_until='domcontentloaded')
            if not response or response.status != 200:
                raise RuntimeError('Game did not return HTTP 200')
            await page.wait_for_function('!!window.__controlsTest', timeout=45000)
            await page.get_by_role('button', name='Start', exact=True).wait_for()
            await page.wait_for_timeout(1800)
            capture = Capture(page, data, out)
            recorder = asyncio.create_task(capture.record())
            failure = None
            try:
                await asyncio.wait_for(capture.journey(), timeout=90)
            except Exception as err:
                failure = str(err)
                await page.screenshot(path=str(out / 'failure.png'))
            finally:
                capture.stop = True
                await recorder
            metadata = {
                'sourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                'url': args.url,
                'recordedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                'viewport': {'width': 1280, 'height': 800}, 'fps': 10, 'frames': capture.frames,
                'durationSeconds': capture.frames / 10, 'audio': False,
                'browser': browser.version, 'inputs': 'Real keyboard and visible UI buttons; fresh isolated browser context',
                'debugStateMutation': False, 'randomness': 'Unmodified game randomness',
                'events': capture.events, 'pageErrors': errors, 'assetHttpErrors': asset_errors,
                'failure': failure,
                'media': {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
                          for p in out.iterdir() if p.suffix in ('.png', '.mp4')},
            }
            (out / 'capture.json').write_text(json.dumps(metadata, indent=2) + '\n')
            print(json.dumps({'duration': metadata['durationSeconds'], 'failure': failure, 'errors': errors, 'assetErrors': asset_errors}), flush=True)
            if failure or errors or asset_errors:
                raise RuntimeError(f'Capture failed validation: {failure or errors or asset_errors}')
        finally:
            await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8081/')
    parser.add_argument('--out', default=str(ROOT / 'docs/showcase'))
    parser.add_argument('--chromium', help='Path to an installed Chromium executable')
    asyncio.run(main(parser.parse_args()))
