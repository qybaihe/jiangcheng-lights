"""Grade original Image2 masters once and write verifiable browser provenance.

No network calls. Originals and prompts remain unchanged. Selection overrides
only point to separately generated, reviewed revisions; no image is duplicated.
"""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BRIEF = ROOT / "media/wuhan-memory-art-v1.json"
SELECTION = ROOT / "media/wuhan-memory-art-v1-selected.json"
MANIFEST = ROOT / "media/wuhan-memory-art-v1-generated.json"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    brief = json.loads(BRIEF.read_text())
    selection = json.loads(SELECTION.read_text()) if SELECTION.exists() else {}
    items = brief["items"]
    assert len(items) == 44 and len({item["id"] for item in items}) == 44
    assert set(selection) <= {item["id"] for item in items}
    inputs = []
    # Preflight the complete set before updating any browser asset.
    for item in items:
        source_id = selection.get(item["id"], item["id"])
        original = ROOT / f"output/imagegen/wuhan-memories-v1/{source_id}.png"
        prompt = ROOT / f"media/prompts/wuhan-memories-v1/{source_id}.txt"
        assert original.is_file() and original.stat().st_size > 15000, item["id"]
        assert prompt.is_file() and prompt.stat().st_size > 200, item["id"]
        with Image.open(original) as im:
            assert im.size == (1792, 1008), (item["id"], im.size)
            im.verify()
        inputs.append((item, source_id, original, prompt))
    records = []
    for item, source_id, original, prompt in inputs:
        with Image.open(original) as im:
            pixels = np.asarray(im.convert("RGB"), dtype=np.float32) / 255
        luminance = pixels @ np.array([.2126, .7152, .0722], dtype=np.float32)
        lift = (1 - luminance) ** 2 * .055
        pixels = np.clip(pixels * 1.045 + lift[..., None] * np.array([.50, .95, 1.13]), 0, 1)
        destination = ROOT / ("public" + item["image"])
        destination.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(np.uint8(np.rint(pixels * 255))).save(destination, quality=90)
        data = destination.read_bytes()
        records.append({
            "id": item["id"], "url": item["image"], "model": "gpt-image-2",
            "width": 1792, "height": 1008, "bytes": len(data), "sha256": digest(data),
            "original": str(original.relative_to(ROOT)),
            "originalSHA256": digest(original.read_bytes()),
            "prompt": str(prompt.relative_to(ROOT)),
            "promptSHA256": digest(prompt.read_bytes()),
            "generationLog": f"output/qa/wuhan-v1/imagegen/{source_id}.log",
            "selectedRevision": source_id,
            "kind": item["kind"], "title": item["title"],
        })
    assert len({record["sha256"] for record in records}) == 44
    manifest = {
        "version": 1, "completedAt": datetime.now(timezone.utc).isoformat(),
        "status": "all-44-generated-and-graded",
        "model": "gpt-image-2", "quality": "high", "size": "1792x1008",
        "workflow": "Installed imagegen skill CLI through tools/media.py loopback adapter; one separate request per authored memory. User-configured gateway credentials stay offline.",
        "referencePolicy": "Style only. First two images reference story-v2-cg-granny-bamboo.webp; remaining initial compositions reference the lightly graded granny-table.webp. Targeted edits use their own previous master.",
        "grade": {"script": "tools/finalize-wuhan-memory-art.py", "source": "unchanged original PNGs", "webpQuality": 90, "description": "Single mild shadow lift with a restrained green/blue bias; no accumulating edits, no heavy sepia filter."},
        "totalBytes": sum(record["bytes"] for record in records), "records": records,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": manifest["status"], "count": len(records), "bytes": manifest["totalBytes"]}))


if __name__ == "__main__":
    main()
