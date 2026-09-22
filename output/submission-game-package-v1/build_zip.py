"""Package the complete game using binary copies and checksums, never decoding art."""
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import stat
import zipfile

from dotenv import dotenv_values

WORK = Path(__file__).resolve().parent
ROOT = WORK.parents[1]
STAGE = WORK / 'stage/JiangchengLights'
QA = WORK / 'qa'
FINAL = ROOT / 'output/江城有灯-完整游戏包体.zip'


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def main():
    if FINAL.exists():
        raise FileExistsError('Final ZIP already exists; keep the previous delivery intact.')
    for name in ['source-and-runtime-verification.json', 'local-http-verification.json']:
        assert json.loads((QA / name).read_text())['status'] == 'pass'
    generated = {STAGE / 'MANIFEST.json', STAGE / 'SHA256SUMS.txt'}
    files = sorted(p for p in STAGE.rglob('*') if p.is_file() and p not in generated)
    assert not any(p.is_symlink() for p in STAGE.rglob('*'))
    forbidden = {'.git', '.DS_Store', '__MACOSX', 'node_modules', '__pycache__',
                 'audit', 'downloads', 'prompts', '.env', '.env.edgeone'}
    names = set()
    env_values = []
    for env_file in [ROOT / '.env', ROOT / '.env.edgeone']:
        if env_file.exists():
            for key, value in dotenv_values(env_file).items():
                if value and len(value) >= 12 and re.search(r'KEY|TOKEN|SECRET|PASSWORD|AUTH|GPT_AK', key, re.I):
                    env_values.append(value.encode())
    entries = []
    for p in files:
        rel = p.relative_to(STAGE).as_posix()
        assert not (set(PurePosixPath(rel).parts) & forbidden), rel
        assert not any(part.startswith('.env') for part in PurePosixPath(rel).parts), rel
        assert p.suffix.lower() not in {'.log', '.map', '.bak', '.pyc'}, rel
        assert rel.casefold() not in names, 'Case-insensitive path collision'
        names.add(rel.casefold())
        data = p.read_bytes()
        assert not any(value in data for value in env_values), 'Credential audit failed; contents omitted.'
        if p.suffix.lower() in {'.js', '.mjs', '.json', '.html', '.css', '.txt', '.md', '.bat', '.command', '.sh'}:
            assert str(ROOT).encode() not in data, 'Local workspace path included in package.'
        entries.append({'path': rel, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    manifest = {
        'title': '江城有灯', 'package_kind': 'Complete browser game with local launchers',
        'game_release': '2026-09-14 competition submission',
        'packaged_at': datetime.now(timezone.utc).isoformat(),
        'game_entry': 'game/index.html',
        'local_url': 'http://127.0.0.1:19626/',
        'online_url': 'https://jcyd.classby.cn/',
        'bundled_platforms': ['Windows x64', 'macOS arm64'],
        'other_platforms': 'Intel macOS and Linux can use installed Node.js 18+',
        'asset_policy': 'Same production game code; original local quality for all active models and five 1080P cinematics',
        'game_file_count': sum(x['path'].startswith('game/') for x in entries),
        'payload_file_count': len(entries),
        'payload_bytes': sum(x['bytes'] for x in entries),
        'credential_material_included': False,
        'files': entries,
    }
    manifest_path = STAGE / 'MANIFEST.json'
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    sums = [f"{e['sha256']}  {e['path']}" for e in entries]
    sums.append(f'{digest(manifest_path)}  MANIFEST.json')
    (STAGE / 'SHA256SUMS.txt').write_text('\n'.join(sums) + '\n')
    files = sorted(p for p in STAGE.rglob('*') if p.is_file())
    staged_hashes = {p.relative_to(STAGE.parent).as_posix(): digest(p) for p in files}
    temporary = FINAL.with_suffix('.zip.partial')
    print(f'Compressing {len(files)} files...', flush=True)
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED,
                         compresslevel=6, allowZip64=True) as archive:
        for p in files:
            archive.write(p, p.relative_to(STAGE.parent).as_posix())
    print('Verifying every ZIP entry, CRC and SHA-256...', flush=True)
    with zipfile.ZipFile(temporary) as archive:
        assert len(archive.infolist()) == len(files)
        assert set(archive.namelist()) == set(staged_hashes)
        for item in archive.infolist():
            name = PurePosixPath(item.filename)
            assert not name.is_absolute() and '..' not in name.parts
            h = hashlib.sha256()
            with archive.open(item) as source:
                for block in iter(lambda: source.read(1024 * 1024), b''):
                    h.update(block)
            assert h.hexdigest() == staged_hashes[item.filename], item.filename
        for rel in ['Play-macOS.command', 'Play-Linux.sh', 'runtime/macos-arm64/bin/node']:
            mode = archive.getinfo('JiangchengLights/' + rel).external_attr >> 16
            assert mode & stat.S_IXUSR, f'Executable mode missing: {rel}'
    assert 200_000_000 <= temporary.stat().st_size < 30_000_000_000
    temporary.replace(FINAL)
    sha256 = digest(FINAL)
    FINAL.with_suffix('.zip.sha256').write_text(f'{sha256}  {FINAL.name}\n')
    report = {
        'status': 'pass', 'zip': str(FINAL), 'zip_bytes': FINAL.stat().st_size,
        'zip_mb': round(FINAL.stat().st_size / 1_000_000, 2),
        'uncompressed_bytes': sum(p.stat().st_size for p in files),
        'file_count': len(files), 'game_file_count': manifest['game_file_count'],
        'zip_sha256': sha256, 'all_entry_crc_and_sha256_valid': True,
        'executable_permissions_retained': True, 'private_material_matches': 0,
        'image_decoding_or_visual_inspection': False,
        'source_receipt': 'source-and-runtime-verification.json',
        'http_receipt': 'local-http-verification.json',
        'platform_check': 'Bundled macOS arm64 runtime exercised locally; Windows runtime archive verified against official checksum',
    }
    (QA / 'zip-acceptance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
