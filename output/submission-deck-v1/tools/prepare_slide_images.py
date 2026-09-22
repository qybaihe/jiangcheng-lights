"""Encode approved full-page Image2 masters; never add text or recompose a page."""
from pathlib import Path
import hashlib
import json
import shutil
from PIL import Image, ImageCms

ROOT = Path(__file__).resolve().parents[3]
DECK = ROOT / 'output/submission-deck-v1'


def main():
    plan = json.loads((DECK / 'plan.json').read_text())
    variants_file = DECK / 'selected-images.json'
    variants = json.loads(variants_file.read_text()) if variants_file.exists() else {}
    masters = []
    for page in plan['pages']:
        number = f"{page['n']:02d}"
        name = f"submission-deck-v1-{number}-{page['slug']}"
        source = ROOT / variants.get(number, f'output/imagegen/{name}.png')
        with Image.open(source) as im:
            im.verify()
        with Image.open(source) as im:
            if im.size != (2048, 1152):
                raise ValueError(f'Incorrect full-page dimensions: {source.name} {im.size}')
        masters.append((number, page, source))
    slides = DECK / 'slides'
    slides.mkdir(exist_ok=True)
    allowed = {f'slide-{number}.jpg' for number, _, _ in masters}
    extras = {p.name for p in slides.iterdir()} - allowed
    if extras:
        raise ValueError(f'Unexpected slide inputs: {extras}')
    srgb = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()
    records = []
    thumbs = []
    for number, page, source in masters:
        dest = slides / f'slide-{number}.jpg'
        with Image.open(source) as im:
            im = im.convert('RGB')
            im.save(dest, 'JPEG', quality=95, subsampling=0, optimize=True,
                    progressive=True, icc_profile=srgb)
            thumbs.append(im.resize((640, 360), Image.Resampling.LANCZOS))
        with Image.open(dest) as check:
            check.load()
            assert check.size == (2048, 1152) and check.format == 'JPEG'
        records.append({
            'page': int(number), 'title': page['title'], 'source': str(source),
            'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'jpeg': str(dest), 'width': 2048, 'height': 1152,
            'bytes': dest.stat().st_size,
            'sha256': hashlib.sha256(dest.read_bytes()).hexdigest(),
            'text_origin': 'GPT Image 2 full-page generation, no local text overlay',
        })
    total = sum(r['bytes'] for r in records)
    assert total < 25_000_000, f'Combined image size leaves insufficient deck margin: {total}'
    sheet = Image.new('RGB', (2016, 1560), '#eee8d9')
    for i, thumb in enumerate(thumbs):
        sheet.paste(thumb, (24 + (i % 3) * 664, 24 + (i // 3) * 384))
    (DECK / 'qa').mkdir(exist_ok=True)
    sheet.save(DECK / 'qa/contact-sheet.jpg', quality=94, subsampling=0, optimize=True, icc_profile=srgb)
    payload = {'model': 'gpt-image-2', 'quality': 'high', 'api_mode': 'installed imagegen CLI via existing project adapter',
               'count': len(records), 'total_image_bytes': total,
               'postprocessing': 'JPEG format encoding only; no resize, text overlay, compositing, cropping or padding',
               'images': records}
    (DECK / 'qa/image-export.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2)+'\n')
    previews = DECK / 'assets/browser-previews'
    previews.mkdir(parents=True, exist_ok=True)
    for p in (ROOT / 'public/media').glob('submission-deck-v1-*.webp'):
        shutil.move(str(p), str(previews / p.name))
    print(json.dumps({'count': len(records), 'total_image_mb': round(total/1_000_000, 3),
                      'slides': str(slides), 'contact_sheet': str(DECK / 'qa/contact-sheet.jpg')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
