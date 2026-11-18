from pathlib import Path
import hashlib
import json
import subprocess

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/elevator-20261118'
FFMPEG = r'G:\DevTools\audio-venv\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe'
WIDTH, HEIGHT, FPS = 464, 688, 24
CLIPS = {'enter': ('进入电梯.mp4', 145), 'run': ('电梯运行中.mp4', 38), 'exit': ('离开电梯.mp4', 145)}
KEY = 'format=yuva444p,chromakey=0x00FF00:0.20:0.06,despill=green:mix=0.35,format=rgba'

def frames(path, count, encoded=False, edge_only=False):
    decoder = ['-c:v', 'libvpx-vp9'] if encoded else []
    filters = []
    if edge_only:
        filters.append(f"select='eq(n,0)+eq(n,{count-1})'")
    if not encoded:
        filters.append(KEY)
    args = ['-vf', ','.join(filters)] if filters else []
    cmd = [FFMPEG, '-v', 'error', *decoder, '-i', str(path), '-map', '0:v:0',
           *args, '-fps_mode', 'passthrough', '-frames:v', str(2 if edge_only else count),
           '-pix_fmt', 'rgba', '-f', 'rawvideo', '-']
    return np.frombuffer(subprocess.check_output(cmd), np.uint8).reshape(-1, HEIGHT, WIDTH, 4)

def blend(source, target, amount):
    # 在预乘 Alpha 下过渡，避免透明区域的绿幕像素渗入法阵和发丝。
    a, b = source.astype(np.float32) / 255, target.astype(np.float32) / 255
    a[..., :3] *= a[..., 3:4]
    b[..., :3] *= b[..., 3:4]
    mixed = (1 - amount) * a + amount * b
    rgb = np.divide(mixed[..., :3], mixed[..., 3:4], out=np.zeros_like(mixed[..., :3]),
                    where=mixed[..., 3:4] > 0)
    return np.rint(np.concatenate((rgb, mixed[..., 3:4]), axis=-1) * 255).astype(np.uint8)

def encode(phase, raw):
    result = ASSETS / f'{phase}.webm'
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
                    '-s', f'{WIDTH}x{HEIGHT}', '-r', str(FPS), '-i', '-', '-an', '-c:v', 'libvpx-vp9',
                    '-pix_fmt', 'yuva420p', '-lossless', '1', '-b:v', '0', '-auto-alt-ref', '0',
                    '-cpu-used', '4', str(result)], input=raw.tobytes(), check=True)
    return result

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    center = frames(ASSETS / 'source' / CLIPS['run'][0], 1)[0]
    manifest = {'canvas': [WIDTH, HEIGHT], 'fps': FPS, 'anchorPixels': [42, 600],
                'loopSourceFrames': [0, 38], 'seamBlendFrames': 6, 'clips': {}}
    edges = {}
    box = [WIDTH, HEIGHT, 0, 0]
    for phase, (name, count) in CLIPS.items():
        source = ASSETS / 'source' / name
        raw = frames(source, count).copy()
        assert len(raw) == count
        if phase != 'enter':
            for i in range(6):
                raw[i] = blend(center, raw[i], i / 5)
        if phase != 'exit':
            for i in range(6):
                raw[count - 6 + i] = blend(raw[count - 6 + i], center, i / 5)
        y, x = np.where(np.any(raw[..., 3] > 40, axis=0))
        box = [min(box[0], int(x.min())), min(box[1], int(y.min())),
               max(box[2], int(x.max()) + 1), max(box[3], int(y.max()) + 1)]
        result = encode(phase, raw)
        edges[phase] = frames(result, count, encoded=True, edge_only=True)
        assert all(np.any(frame[..., 3] == 0) and np.any(frame[..., 3] > 200) for frame in edges[phase])
        manifest['clips'][phase] = {'source': name, 'file': result.name, 'frames': count,
                                    'seconds': count / FPS, 'sourceSha256': digest(source), 'sha256': digest(result)}
        print(phase, count, flush=True)
    for left, right in [('enter', 'run'), ('run', 'run'), ('run', 'exit')]:
        assert np.array_equal(edges[left][-1], edges[right][0]), (left, right)
    manifest['occupancyPixels'] = box
    (ASSETS / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
    print('All three decoded seams identical; occupancy:', box, flush=True)

if __name__ == '__main__':
    main()
