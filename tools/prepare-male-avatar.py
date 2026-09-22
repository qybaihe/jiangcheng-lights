"""Build the Jiangcheng male palette from the licensed VRoid AvatarSample_C.

Run with .venv/bin/python tools/prepare-male-avatar.py. The source is retained
under output/qa/character-choice; no network or generation API is called here.
Only bitmap colours, uniform normal-map size, the redundant hair-outline pass
and provenance metadata change. Geometry and skin weights remain untouched.
An optional --thumbnail may embed a rendered portrait of the adapted model.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import io
import json
import struct

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/qa/character-choice'
SOURCE = OUT / 'avatar-sample-c-original.vrm'
DEST = ROOT / 'public/models/ayao-male.vrm'
SOURCE_HASH = '395d5b04696e888f07bc856ae01bf72a974b7e773132c7443dc59d1688045b8a'
TERMS = 'https://vroid.pixiv.help/hc/en-us/articles/4402394424089'


def build(thumbnail=None):
    if thumbnail is None and (OUT / 'male-adapted-head.png').is_file():
        thumbnail = OUT / 'male-adapted-head.png'
    raw = SOURCE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_HASH:
        raise ValueError('Source differs from the reviewed AvatarSample_C binary')
    length = struct.unpack_from('<I', raw, 12)[0]
    doc = json.loads(raw[20:20 + length])
    original = copy.deepcopy(doc)
    binary = raw[28 + length:]
    replacements, texture_report = {}, []
    changed = {5, 17, 18, 19, 20}
    for index, item in enumerate(doc['images']):
        view = doc['bufferViews'][item['bufferView']]
        data = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        im = Image.open(io.BytesIO(data)).convert('RGBA')
        size_before = im.size
        pixels = np.array(im)
        alpha_before = pixels[:, :, 3].copy()
        rgb = pixels[:, :, :3].astype(np.float32)
        if index == 17:
            # Remove only the sample's collar print, using its surrounding
            # cloth; attribution remains in the model metadata and licence.
            x0, y0, x1, y1 = 1098, 336, 1154, 390
            patch = rgb[y0:y1, x0:x1]
            mask = Image.fromarray((patch.mean(axis=2) > 65).astype(np.uint8) * 255)
            mask = np.array(mask.filter(ImageFilter.MaxFilter(5))) > 0
            left = rgb[y0:y1, x0-4:x0-1].mean(axis=1)
            right = rgb[y0:y1, x1+1:x1+4].mean(axis=1)
            t = np.linspace(0, 1, x1-x0)[None, :, None]
            cloth = left[:, None, :] * (1-t) + right[:, None, :] * t
            patch[mask] = cloth[mask]
        luminance = rgb @ np.array([.299, .587, .114])
        if index == 5:  # Red fantasy iris -> natural warm brown; retain radial detail.
            mask = (rgb[:, :, 0] > rgb[:, :, 1] * 1.18) & (rgb[:, :, 0] > rgb[:, :, 2] * 1.12)
            rgb[mask] = np.array([13, 10, 8]) + luminance[mask, None] * np.array([1.17, .79, .46])
        elif index == 17:  # Retain the jacket's zipper, stitching and authored folds.
            dark = luminance < 82
            rgb[dark] = np.array([43, 62, 52]) + luminance[dark, None] * np.array([.47, .59, .47])
            rgb[~dark] = np.array([137, 131, 111]) + luminance[~dark, None] * np.array([.44, .45, .47])
        elif index == 18:  # Everyday ink-green trousers, without changing the cut.
            rgb = np.array([13, 27, 23]) + luminance[:, :, None] * np.array([.48, .56, .51])
        elif index == 19:  # Softer charcoal canvas/suede shoe palette.
            rgb = np.array([25, 31, 28]) + luminance[:, :, None] * np.array([.76, .79, .73])
        elif index == 20:  # Soft deep chestnut, retaining the original hair shading.
            rgb = np.array([10, 7, 4]) + rgb * np.array([1.02, .94, .85])
        if index in changed:
            pixels[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
            assert np.array_equal(pixels[:, :, 3], alpha_before)
            im = Image.fromarray(pixels)
            im.save(OUT / f'male-adapted-texture-{index}.png', optimize=True)
        # Keep face/hair/cloth maps at their authored resolution. A truly flat
        # normal needs no large texture; never downsample detailed normal maps.
        if 'nml' in item.get('name', '').lower() and np.ptp(pixels[:, :, :3], axis=(0, 1)).max() == 0:
            im = im.resize((8, 8), Image.Resampling.NEAREST)
        if item.get('name') == 'Thumbnail':
            if thumbnail:
                im = Image.open(thumbnail).convert('RGBA')
            im.thumbnail((256, 256), Image.Resampling.LANCZOS)
        stream = io.BytesIO()
        im.save(stream, format='PNG', optimize=True)
        replacements[item['bufferView']] = stream.getvalue()
        texture_report.append({'index': index, 'name': item.get('name'), 'sizeBefore': size_before,
                               'sizeAfter': im.size, 'recoloured': index in changed})

    chunks = bytearray()
    retained_views = 0
    for index, view in enumerate(doc['bufferViews']):
        start, size = view.get('byteOffset', 0), view['byteLength']
        before = binary[start:start + size]
        data = replacements.get(index, before)
        chunks.extend(b'\0' * (-len(chunks) % 4))
        view['byteOffset'], view['byteLength'] = len(chunks), len(data)
        chunks.extend(data)
        if index not in replacements:
            assert data == before
            retained_views += 1
    chunks.extend(b'\0' * (-len(chunks) % 4))
    doc['buffers'][0]['byteLength'] = len(chunks)
    meta = doc['extensions']['VRM']['meta']
    meta['title'] = 'AvatarSample_C / Jiangcheng Lights male palette adaptation'
    meta['reference'] = 'Base model: VRoid, pixiv Inc. Jiangcheng Lights palette adaptation. See AVATAR-LICENSE.md.'
    meta['otherLicenseUrl'] = TERMS
    meta['otherPermissionUrl'] = TERMS
    # The game has its own screen-space outline. VRM0's separate outline on
    # every hair primitive duplicates it and prevents safe material batching.
    # Keep the hair's actual triangles, texture, alpha and spring bones intact.
    material_overrides = []
    for material in doc['extensions']['VRM']['materialProperties']:
        if material['name'].endswith('_HAIR'):
            props = material['floatProperties']
            material_overrides.append({'material': material['name'],
                'before': {'_OutlineWidthMode': props.get('_OutlineWidthMode'), '_OutlineWidth': props.get('_OutlineWidth')},
                'after': {'_OutlineWidthMode': 0, '_OutlineWidth': 0}})
            props['_OutlineWidthMode'] = 0
            props['_OutlineWidth'] = 0
    for key in ['nodes', 'meshes', 'skins', 'accessors', 'animations']:
        assert doc.get(key) == original.get(key), f'{key} unexpectedly changed'
    for key in ['humanoid', 'blendShapeMaster', 'secondaryAnimation', 'firstPerson']:
        assert doc['extensions']['VRM'].get(key) == original['extensions']['VRM'].get(key), key
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
        'sourceSha256': SOURCE_HASH, 'outputSha256': hashlib.sha256(result).hexdigest(),
        'changes': ['natural brown irises', 'sage and warm cream everyday jacket', 'collar sample print removed with local cloth repair', 'ink-green trousers',
                    'soft charcoal shoes', 'deep chestnut hair', 'smaller metadata thumbnail and flat normal maps',
                    'redundant per-hair outline disabled for existing game outline and mesh batching'],
        'geometryUnchanged': True, 'skinWeightsUnchanged': True, 'expressionsUnchanged': True,
        'springsUnchanged': True, 'unchangedNonImageBufferViews': retained_views,
        'humanoidBones': len(doc['extensions']['VRM']['humanoid']['humanBones']),
        'expressionGroups': len(doc['extensions']['VRM']['blendShapeMaster']['blendShapeGroups']),
        'materialOverrides': material_overrides,
        'textures': texture_report,
        'thumbnailSource': str(Path(thumbnail).resolve().relative_to(ROOT)) if thumbnail else 'original sample thumbnail; pending adapted render',
    }
    (OUT / 'male-asset-build.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'textures'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--thumbnail', type=Path)
    build(parser.parse_args().thumbnail)
