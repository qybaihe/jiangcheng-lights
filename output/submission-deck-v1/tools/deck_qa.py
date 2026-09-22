#!/usr/bin/env python3
"""Technical checks only. Does not render/repair any visible slide design."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import posixpath
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

import numpy as np
from PIL import Image
from pypdf import PdfReader

NS = {
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'rel': 'http://schemas.openxmlformats.org/package/2006/relationships',
}
for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

def check(condition, message):
    if not condition:
        raise AssertionError(message)

def relationship_target(base, target):
    return target.lstrip('/') if target.startswith('/') else posixpath.normpath(posixpath.join(base, target))

def preflight(args):
    slides_dir = Path(args.slides).resolve()
    paths = [slides_dir / f'slide-{i:02d}.jpg' for i in range(1, args.count + 1)]
    slides = []
    for i, path in enumerate(paths, 1):
        check(path.is_file(), f'Missing final source {path}')
        data = path.read_bytes()
        with Image.open(io.BytesIO(data)) as im:
            check(im.format == 'JPEG', f'{path} must be JPEG')
            check(im.size == (2048, 1152), f'{path}: expected 2048x1152, got {im.size}')
            check(im.mode == 'RGB', f'{path} must be RGB')
            im.verify()
        slides.append({'index': i, 'image': str(path), 'prompt': str(slides_dir.parent / 'prompts' / f'slide-{i:02d}.md'), 'sha256': sha(data), 'bytes': len(data), 'dimensions': [2048, 1152]})
    manifest = {'expected_slide_count': args.count, 'canvas_px': [2048, 1152], 'presentation_canvas_px': [1280, 720], 'slides': slides}
    write_json(Path(args.manifest), manifest)
    print(json.dumps({'preflight': 'pass', 'slides': len(slides), 'source_bytes': sum(s['bytes'] for s in slides)}, ensure_ascii=False))

def add_link(args):
    pptx = Path(args.pptx)
    slide_name = f'ppt/slides/slide{args.slide}.xml'
    rel_name = f'ppt/slides/_rels/slide{args.slide}.xml.rels'
    with ZipFile(pptx) as z:
        entries = {n: z.read(n) for n in z.namelist()}
    slide = ET.fromstring(entries[slide_name])
    pictures = slide.findall('.//p:pic', NS)
    check(len(pictures) == 1, 'Expected one picture on linked slide')
    props = pictures[0].find('p:nvPicPr/p:cNvPr', NS)
    check(props is not None, 'Picture nonvisual properties missing')
    rels = ET.fromstring(entries[rel_name])
    link_id = 'rIdGameExperience'
    check(all(r.get('Id') != link_id for r in rels), 'Link id already exists')
    ET.SubElement(props, f'{{{NS["a"]}}}hlinkClick', {f'{{{NS["r"]}}}id': link_id, 'tooltip': '打开《江城有灯》网页版 Demo'})
    ET.SubElement(rels, f'{{{NS["rel"]}}}Relationship', {'Id': link_id, 'Type': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', 'Target': args.url, 'TargetMode': 'External'})
    entries[slide_name] = ET.tostring(slide, encoding='utf-8', xml_declaration=True)
    entries[rel_name] = ET.tostring(rels, encoding='utf-8', xml_declaration=True)
    temp = pptx.with_suffix('.linked.pptx')
    with ZipFile(temp, 'w', ZIP_DEFLATED) as z:
        for name, data in entries.items():
            z.writestr(name, data)
    temp.replace(pptx)
    print('Added last-page game URL as image hyperlink metadata only.')

def comparison(source_path: Path, render_path: Path):
    with Image.open(source_path) as im:
        original = im.convert('RGB')
        source = np.asarray(original).astype(np.float32)
        source_small = np.asarray(original.resize((256, 144), Image.Resampling.LANCZOS)).astype(np.float32)
    with Image.open(render_path) as im:
        check(im.size == (2048, 1152), f'Wrong render dimensions for {render_path}: {im.size}')
        rendered = im.convert('RGB')
        target = np.asarray(rendered).astype(np.float32)
        target_small = np.asarray(rendered.resize((256, 144), Image.Resampling.LANCZOS)).astype(np.float32)
    diff = np.abs(source - target)
    mse = float(np.mean((source - target) ** 2))
    mae = float(diff.mean())
    # Full-image and edge metrics expose offset, cropping, padding, or lost content.
    edge = np.concatenate([diff[:12].ravel(), diff[-12:].ravel(), diff[:, :12].ravel(), diff[:, -12:].ravel()])
    return {'mean_absolute_error': round(mae, 6), 'rmse': round(mse ** 0.5, 6), 'psnr_db': None if mse == 0 else round(float(20 * np.log10(255 / (mse ** 0.5))), 4), 'edge_mae': round(float(edge.mean()), 6), 'thumbnail_mae': round(float(np.abs(source_small - target_small).mean()), 6)}

def verify(args):
    manifest = json.loads(Path(args.manifest).read_text(encoding='utf-8'))
    count = manifest['expected_slide_count']
    pptx, pdf = Path(args.pptx), Path(args.pdf)
    for path in [pptx, pdf]:
        check(path.stat().st_size < 30_000_000, f'{path}: exceeds 30,000,000 bytes')
    report = {'status': 'pass', 'limits': {'max_bytes_each_exclusive': 30_000_000, 'slides': count, 'source_px': [2048, 1152]}, 'files': {}, 'slides': []}
    for path in [pptx, pdf]:
        report['files'][path.name] = {'path': str(path.resolve()), 'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())}
    with ZipFile(pptx) as z:
        presentation = ET.fromstring(z.read('ppt/presentation.xml'))
        size = presentation.find('p:sldSz', NS)
        check(size is not None and (int(size.get('cx')), int(size.get('cy'))) == (12192000, 6858000), 'PPT size must be exactly 16:9')
        ids = presentation.findall('p:sldIdLst/p:sldId', NS)
        rels = {r.get('Id'): r.get('Target') for r in ET.fromstring(z.read('ppt/_rels/presentation.xml.rels'))}
        check(len(ids) == count, 'PPT slide count mismatch')
        order = [relationship_target('ppt', rels[i.get(f'{{{NS["r"]}}}id')]) for i in ids]
        media_total = len([n for n in z.namelist() if n.startswith('ppt/media/') and not n.endswith('/')])
        for i, (slide_path, source) in enumerate(zip(order, manifest['slides']), 1):
            slide = ET.fromstring(z.read(slide_path))
            pictures = slide.findall('.//p:pic', NS)
            check(len(pictures) == 1, f'Slide {i}: must contain exactly one image')
            for unwanted in ['p:sp', 'p:graphicFrame', 'p:cxnSp']:
                check(not slide.findall(f'.//{unwanted}', NS), f'Slide {i}: unexpected visible object {unwanted}')
            check(not slide.findall('.//a:t', NS), f'Slide {i}: added visible native text')
            xfrm = pictures[0].find('p:spPr/a:xfrm', NS)
            off, ext = xfrm.find('a:off', NS), xfrm.find('a:ext', NS)
            check((int(off.get('x')), int(off.get('y'))) == (0, 0), f'Slide {i}: image is offset')
            check((int(ext.get('cx')), int(ext.get('cy'))) == (12192000, 6858000), f'Slide {i}: image not full bleed')
            crop = pictures[0].find('p:blipFill/a:srcRect', NS)
            check(crop is None or all(int(v) == 0 for v in crop.attrib.values()), f'Slide {i}: crop is not zero')
            rel_path = posixpath.join(posixpath.dirname(slide_path), '_rels', posixpath.basename(slide_path) + '.rels')
            img_rels = {r.get('Id'): r for r in ET.fromstring(z.read(rel_path))}
            embed_id = pictures[0].find('p:blipFill/a:blip', NS).get(f'{{{NS["r"]}}}embed')
            media_path = relationship_target(posixpath.dirname(slide_path), img_rels[embed_id].get('Target'))
            data = z.read(media_path)
            check(sha(data) == source['sha256'], f'Slide {i}: embedded image does not match its source exactly')
            with Image.open(io.BytesIO(data)) as im:
                check(im.size == (2048, 1152) and im.format == 'JPEG', f'Slide {i}: embedded dimensions/type mismatch')
            rendered = Path(args.ppt_render) / f'slide-{i}.png'
            metric = comparison(Path(source['image']), rendered)
            check(metric['mean_absolute_error'] <= 2.5 and metric['edge_mae'] <= 3, f'Slide {i}: PPT render differs unexpectedly: {metric}')
            report['slides'].append({'index': i, 'source': source['image'], 'pptx_embedded_image_exact': True, 'pptx_image_count': 1, 'pptx_visible_text_objects': 0, 'pptx_cropping': False, 'pptx_render': metric})
        last = ET.fromstring(z.read(order[-1]))
        link = last.find('.//p:pic/p:nvPicPr/p:cNvPr/a:hlinkClick', NS)
        if args.expected_link:
            check(link is not None, 'Last image hyperlink missing')
            rel_path = posixpath.join(posixpath.dirname(order[-1]), '_rels', posixpath.basename(order[-1]) + '.rels')
            last_rels = {r.get('Id'): r for r in ET.fromstring(z.read(rel_path))}
            target = last_rels[link.get(f'{{{NS["r"]}}}id')].get('Target')
            check(target == args.expected_link, 'Last image hyperlink target mismatch')
            report['last_image_hyperlink'] = target
        report['pptx_media_count'] = media_total
    reader = PdfReader(pdf)
    check(len(reader.pages) == count, 'PDF page count mismatch')
    pdf_render = Path(args.pdf_render)
    pdf_render.mkdir(parents=True, exist_ok=True)
    subprocess.run(['/opt/homebrew/bin/pdftoppm', '-scale-to-x', '2048', '-scale-to-y', '1152', '-png', str(pdf), str(pdf_render / 'slide')], check=True, capture_output=True)
    rendered_files = sorted(pdf_render.glob('slide-*.png'), key=lambda p: int(re.search(r'-(\d+)\.png$', p.name).group(1)))
    check(len(rendered_files) == count, 'PDF rendered page count mismatch')
    for i, (page, source, rendered) in enumerate(zip(reader.pages, manifest['slides'], rendered_files), 1):
        rect = page.mediabox
        check(abs(float(rect.width) / float(rect.height) - 16 / 9) < 1e-6, f'PDF page {i}: wrong aspect ratio')
        check(len(page.images) == 1, f'PDF page {i}: expected one embedded image')
        check(not page.extract_text().strip(), f'PDF page {i}: local text overlay exists')
        embedded = page.images[0].image.convert('RGB')
        check(embedded.size == (2048, 1152), f'PDF page {i}: embedded image was resized')
        embedded_path = pdf_render / f'embedded-{i}.png'
        embedded.save(embedded_path)
        embedded_metric = comparison(Path(source['image']), embedded_path)
        check(embedded_metric['mean_absolute_error'] <= 2, f'PDF page {i}: recompressed source changed: {embedded_metric}')
        expected_draw = f'q {float(rect.width):.6f} 0 0 {float(rect.height):.6f} 0 0 cm /image Do Q'
        check(page.get_contents().get_data().decode().strip() == expected_draw, f'PDF page {i}: contains extra operators or wrong full-page placement')
        metric = comparison(Path(source['image']), rendered)
        # Poppler applies half-pixel interpolation to the full-page raster. The
        # embedded-image and transform checks above are the fidelity authority.
        check(metric['mean_absolute_error'] <= 10 and metric['edge_mae'] <= 8 and metric['thumbnail_mae'] <= 2.5, f'PDF page {i}: render differs unexpectedly: {metric}')
        report['slides'][i - 1]['pdf_render'] = metric
        report['slides'][i - 1]['pdf_embedded_image'] = embedded_metric
        report['slides'][i - 1]['pdf_image_count'] = len(page.images)
        report['slides'][i - 1]['pdf_page_size_pt'] = [float(rect.width), float(rect.height)]
    write_json(Path(args.report), report)
    print(json.dumps({'verification': 'pass', 'slides': count, 'files': report['files'], 'report': str(Path(args.report).resolve())}, ensure_ascii=False, indent=2))

def main():
    parser = argparse.ArgumentParser()
    subs = parser.add_subparsers(dest='command', required=True)
    p = subs.add_parser('preflight')
    p.add_argument('--slides', required=True); p.add_argument('--count', type=int, default=12); p.add_argument('--manifest', required=True)
    p.set_defaults(func=preflight)
    p = subs.add_parser('add-link')
    p.add_argument('--pptx', required=True); p.add_argument('--slide', type=int, required=True); p.add_argument('--url', required=True)
    p.set_defaults(func=add_link)
    p = subs.add_parser('verify')
    for key in ['manifest', 'pptx', 'pdf', 'ppt-render', 'pdf-render', 'report']:
        p.add_argument(f'--{key}', required=True)
    p.add_argument('--expected-link')
    p.set_defaults(func=verify)
    args = parser.parse_args()
    args.func(args)

if __name__ == '__main__':
    main()
