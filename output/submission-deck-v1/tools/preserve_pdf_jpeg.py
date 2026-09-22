"""Keep the strict compiler's page geometry, embedding original JPEG bytes."""
import argparse
import hashlib
import json
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, NumberObject


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pdf', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    pdf = Path(args.pdf)
    manifest = json.loads(Path(args.manifest).read_text())
    reader = PdfReader(pdf)
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    if len(writer.pages) != manifest['expected_slide_count']:
        raise ValueError('Page count mismatch')
    records = []
    for page, source in zip(writer.pages, manifest['slides']):
        resources = page['/Resources']['/XObject']
        if len(resources) != 1:
            raise ValueError('Expected one full-page image')
        stream = next(iter(resources.values())).get_object()
        data = Path(source['image']).read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != source['sha256']:
            raise ValueError('Source JPEG changed since preflight')
        stream._data = data
        stream[NameObject('/Filter')] = NameObject('/DCTDecode')
        stream[NameObject('/ColorSpace')] = NameObject('/DeviceRGB')
        stream[NameObject('/BitsPerComponent')] = NumberObject(8)
        for key in ['/DecodeParms', '/Decode', '/Length']:
            if key in stream:
                del stream[key]
        records.append({'page': source['index'], 'jpeg_sha256': digest,
                        'jpeg_bytes': len(data)})
    temp = pdf.with_suffix('.jpeg-preserved.pdf')
    with temp.open('wb') as handle:
        writer.write(handle)
    # Verify the complete written PDF before publishing it in place.
    check = PdfReader(temp)
    for page, source in zip(check.pages, manifest['slides']):
        stream = next(iter(page['/Resources']['/XObject'].values())).get_object()
        if hashlib.sha256(stream._data).hexdigest() != source['sha256']:
            raise ValueError('Written PDF did not preserve its JPEG bytes')
    temp.replace(pdf)
    Path(args.report).write_text(json.dumps({
        'status': 'pass', 'pdf': str(pdf.resolve()),
        'operation': 'Replace compiler-reencoded DCT streams with original JPEG bytes; page layout unchanged',
        'pages': records, 'bytes': pdf.stat().st_size,
    }, ensure_ascii=False, indent=2) + '\n')
    print(f'Preserved original JPEG bytes in {len(records)} PDF pages.')


if __name__ == '__main__':
    main()
