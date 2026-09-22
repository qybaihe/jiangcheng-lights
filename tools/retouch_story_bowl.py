"""Add one tiny ceramic glaze chip to the approved Image2 source; no API call.

Only a small RGBA overlay touches the bowl's rear-right rim. Original source
pixels outside that overlay remain identical in the PNG. WebP is a separate
lossy browser derivative, not the pixel-preservation evidence.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import hashlib
import json
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'output/imagegen/story-v2-cg-granny-table.png'
DEST = ROOT / 'output/imagegen/story-v2-cg-granny-table-r3.png'
WEB = ROOT / 'public/media/story-v2-cg-granny-table-r3.webp'
QA = ROOT / 'output/qa/story-v2'
EXPECTED_SOURCE = '53c78396e7a35016b0370f11e42242ab69e617eb7d983d5a01f910132792305a'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if sha(SOURCE) != EXPECTED_SOURCE:
        raise RuntimeError('Source changed; inspect rim coordinates before retouching.')
    base = Image.open(SOURCE).convert('RGB')
    assert base.size == (1536, 1024)
    # A small, irregular, warm-grey exposed ceramic spot breaks the painted
    # blue stripe. No black dot, crack, detached shard or structural hole.
    x0, y0, size, scale = 832, 630, 14, 8
    layer = Image.new('RGBA', (size * scale, size * scale), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    def pts(coords):
        return [((x - x0) * scale, (y - y0) * scale) for x, y in coords]
    outline = [(835.1, 632.7), (838.2, 633.4), (839.0, 634.1),
               (841.7, 634.6), (842.1, 635.7), (840.9, 636.8),
               (840.1, 638.0), (837.9, 637.6), (836.2, 636.4),
               (835.0, 635.6)]
    d.polygon(pts(outline), fill=(188, 184, 172, 255))
    d.polygon(pts([(835.4, 633.0), (838.1, 633.7), (838.8, 634.5),
                   (841.3, 634.9), (840.8, 635.7), (838.4, 635.2),
                   (836.1, 634.8)]), fill=(214, 207, 190, 255))
    d.line(pts([(835.3, 635.5), (836.4, 636.3), (838.0, 637.3),
                (840.0, 637.7)]), fill=(149, 148, 140, 215), width=4)
    patch = layer.resize((size, size), Image.Resampling.LANCZOS)
    edited = base.copy()
    edited.paste(patch, (x0, y0), patch)
    DEST.parent.mkdir(parents=True, exist_ok=True)
    QA.mkdir(parents=True, exist_ok=True)
    edited.save(DEST)
    edited.save(WEB, quality=94, method=6)

    A = np.asarray(base)
    B = np.asarray(Image.open(DEST).convert('RGB'))
    changed = np.any(A != B, axis=2)
    yy, xx = np.nonzero(changed)
    bbox = [int(xx.min()), int(yy.min()), int(xx.max()) + 1, int(yy.max()) + 1]
    outside = changed.copy()
    outside[y0:y0+size, x0:x0+size] = False
    assert not outside.any(), 'Unexpected change outside the tiny patch'
    record = {
        'provenance': 'Image2 original + local pixel retouch',
        'generation_api_called': False,
        'source': str(SOURCE.relative_to(ROOT)),
        'source_sha256': sha(SOURCE),
        'output': str(DEST.relative_to(ROOT)),
        'output_sha256': sha(DEST),
        'webp': str(WEB.relative_to(ROOT)),
        'webp_sha256': sha(WEB),
        'size': list(base.size),
        'modified_pixel_count': int(changed.sum()),
        'modified_bbox_xyxy_exclusive': bbox,
        'unchanged_pixels_outside_patch': True,
        'patch_scope_xyxy_exclusive': [x0, y0, x0+size, y0+size],
        'note': 'PNG outside patch is bitwise identical; browser WebP is lossy.'
    }
    (QA / 'granny-table-r3-retouch.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    for name, box, zoom in [('bowl', (650, 600, 900, 760), 3), ('rim', (818, 626, 852, 647), 10)]:
        w, h = box[2]-box[0], box[3]-box[1]
        board = Image.new('RGB', (w*zoom*2, h*zoom+24), (247, 241, 227))
        text = ImageDraw.Draw(board)
        for i, (im, label) in enumerate([(base, 'Image2 original'), (edited, 'r3 local pixel retouch')]):
            board.paste(im.crop(box).resize((w*zoom, h*zoom), Image.Resampling.NEAREST if name == 'rim' else Image.Resampling.LANCZOS), (i*w*zoom, 24))
            text.text((i*w*zoom+8, 6), label, fill=(35, 50, 40))
        board.save(QA / f'granny-table-r3-{name}-comparison.png')
    print(json.dumps(record, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
