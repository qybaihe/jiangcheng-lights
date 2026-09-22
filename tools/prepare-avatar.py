"""Create the locally packaged Jiangcheng palette variant of VRoid AvatarSample_A.

Requires Pillow and numpy. Geometry, skin weights and expressions are preserved.
See public/models/AVATAR-LICENSE.md for the source asset's separate terms.
"""
from pathlib import Path
import hashlib
import io
import json
import struct

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/qa/character-art/candidates/avatar-sample-a.vrm'
DEST = ROOT / 'public/models/ayao.vrm'
raw = SOURCE.read_bytes()
length = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20 + length])
binary = raw[28 + length:]
replacements = {}

for index, image in enumerate(doc['images']):
    view = doc['bufferViews'][image['bufferView']]
    data = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
    im = Image.open(io.BytesIO(data)).convert('RGBA')
    pixels = np.array(im).astype(np.float32)
    rgb = pixels[:, :, :3]
    luminance = rgb @ np.array([.299, .587, .114])
    if index == 17:  # Blue ribbons -> quiet jade; keep knit texture and buttons.
        r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
        mask = (g > r * 1.16) & (b > r * 1.16) & (pixels[:, :, 3] > 0)
        rgb[mask] = luminance[mask, None] * np.array([.66, 1.00, .80])
    elif index == 18:  # Charcoal shorts -> ink green, preserving authored folds.
        mask = (np.max(rgb, axis=2) - np.min(rgb, axis=2) < 36) & (luminance < 135)
        rgb[mask] = np.array([10, 20, 16]) + luminance[mask, None] * np.array([.61, .76, .66])
    elif index == 15:  # Matte green legwear, preserving skin/face atlas regions.
        h, w = luminance.shape
        yy, xx = np.mgrid[0:h, 0:w]
        side_legs = ((xx < w * .24) | (xx > w * .76)) & (yy > h * .515)
        center = (xx >= w * .24) & (xx <= w * .76) & (yy > h * .455) & (yy < h * .79)
        mask = side_legs | (center & (rgb[:, :, 0] < 145) & (rgb[:, :, 1] < 120) & (rgb[:, :, 2] < 110))
        rgb[mask] = np.array([23, 37, 31]) + luminance[mask, None] * np.array([.20, .25, .22])
    elif index in (20, 24, 25, 26):  # Softer chestnut highlight, less pink sheen.
        t = np.clip(luminance / 255, 0, 1) ** .78
        rgb[:] = np.array([24, 17, 14]) + t[:, :, None] * np.array([126, 103, 77])
    pixels[:, :, :3] = np.clip(rgb, 0, 255)
    im = Image.fromarray(pixels.astype(np.uint8))
    # Keep face/hair/knit resolution. Only the unused inventory thumbnail and
    # large uniform normal maps are reduced; no surface detail is invented.
    if index == 27:
        im.thumbnail((256, 256), Image.Resampling.LANCZOS)
    elif 'nml' in image.get('name', '').lower():
        im.thumbnail((512, 512), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    im.save(output, format='PNG', optimize=True)
    replacements[image['bufferView']] = output.getvalue()

chunks = bytearray()
for index, view in enumerate(doc['bufferViews']):
    start, size = view.get('byteOffset', 0), view['byteLength']
    data = replacements.get(index, binary[start:start + size])
    while len(chunks) % 4:
        chunks.append(0)
    view['byteOffset'], view['byteLength'] = len(chunks), len(data)
    chunks.extend(data)
while len(chunks) % 4:
    chunks.append(0)
doc['buffers'][0]['byteLength'] = len(chunks)
meta = doc['extensions']['VRM']['meta']
meta['title'] = 'AvatarSample_A / Jiangcheng Lights palette adaptation'
meta['reference'] = 'Base model: VRoid, pixiv Inc. Modified colours for Jiangcheng Lights. See AVATAR-LICENSE.md.'
meta['otherLicenseUrl'] = 'https://vroid.pixiv.help/hc/en-us/articles/4402394424089'
meta['otherPermissionUrl'] = meta['otherLicenseUrl']
encoded = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
result = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(encoded) + 8 + len(chunks))
result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
result += struct.pack('<II', len(chunks), 0x004E4942) + chunks
DEST.parent.mkdir(parents=True, exist_ok=True)
DEST.write_bytes(result)
report = {
    'source': str(SOURCE.relative_to(ROOT)), 'output': str(DEST.relative_to(ROOT)),
    'sourceBytes': len(raw), 'outputBytes': len(result),
    'sourceSha256': hashlib.sha256(raw).hexdigest(), 'outputSha256': hashlib.sha256(result).hexdigest(),
    'changes': ['jade ribbons', 'ink-green shorts', 'matte green legwear', 'soft chestnut hair', 'smaller thumbnail and normal maps'],
    'geometryUnchanged': True,
}
(ROOT / 'output/qa/character-art/asset-build.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
