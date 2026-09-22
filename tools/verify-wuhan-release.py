"""Verify the Wuhan release's served bytes and offline credential isolation."""

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/qa/wuhan-v1"
BASE = "http://127.0.0.1:4173"
OUT.mkdir(parents=True, exist_ok=True)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fetch(path):
    with urlopen(BASE + path, timeout=30) as response:
        assert response.status == 200, path
        return response.read()


def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    timestamp = datetime.now(timezone.utc).isoformat()
    index = (ROOT / "dist/index.html").read_bytes()
    assert fetch("/?v=wuhan-v1") == index, "The served HTML differs from dist"
    paths = set(re.findall(r'(?:src|href)="(/[^"?#]+)', index.decode()))
    paths.update("/" + str(p.relative_to(ROOT / "dist")) for p in (ROOT / "dist/assets").glob("*"))
    art = json.loads((ROOT / "media/wuhan-memory-art-v1-generated.json").read_text())
    assert len(art["records"]) == 44
    expected_art = {record["url"]: record for record in art["records"]}
    models = json.loads((ROOT / "media/resident-model-sources.json").read_text())
    expected_models = {record["url"]: record for record in models["residents"]}
    paths.update(expected_art)
    paths.update(expected_models)
    paths.add("/models/residents/RESIDENT-LICENSE.md")
    webmanifest = json.loads((ROOT / "public/site.webmanifest").read_text())
    paths.update(icon["src"] for icon in webmanifest.get("icons", []))
    checks = []
    for path in sorted(paths):
        built = (ROOT / "dist" / path.lstrip("/")).read_bytes()
        assert fetch(path) == built, f"Served bytes differ: {path}"
        source = ROOT / "public" / path.lstrip("/")
        if source.is_file():
            assert built == source.read_bytes(), f"Public/dist mismatch: {path}"
        sha256 = digest(built)
        if path in expected_art:
            record = expected_art[path]
            assert sha256 == record["sha256"] and len(built) == record["bytes"], path
        if path in expected_models:
            record = expected_models[path]
            assert sha256 == record["sha256"] and len(built) == record["outputBytes"], path
        checks.append({"path": path, "sha256": sha256, "bytes": len(built)})
    write("production-serving.json", {
        "status": "passed", "verifiedAt": timestamp, "url": BASE + "/?v=wuhan-v1",
        "indexSHA256": digest(index), "resourceChecks": checks,
        "memoryCount": len(expected_art), "memoryBytes": art["totalBytes"],
        "preservedResidentCount": len(expected_models),
        "comparison": "served = dist = public source; all 44 memories and nine resident models match provenance",
    })
    # Exact values are used only in process memory and never written to reports.
    secrets = {
        value for key, value in dotenv_values(ROOT / ".env").items()
        if re.search(r"KEY|TOKEN|SECRET|PASSWORD|(?:^|_)(?:AK|SK)$", key, re.I)
        and value and len(value) >= 12
    }
    assert secrets, "No local credential values available for the isolation check"
    extensions = {".js", ".mjs", ".cjs", ".ts", ".json", ".html", ".css", ".md", ".txt", ".svg", ".webmanifest", ".map", ".xml", ".yaml", ".yml"}
    scanned, matches = 0, []
    for directory in ("src", "public", "dist"):
        for path in (ROOT / directory).rglob("*"):
            if not path.is_file() or path.suffix.lower() not in extensions:
                continue
            content = path.read_text(errors="replace")
            scanned += 1
            if any(value in content for value in secrets):
                matches.append(str(path.relative_to(ROOT)))
    write("credential-scan.json", {
        "status": "failed" if matches else "passed", "verifiedAt": timestamp,
        "textFilesScanned": scanned, "secretMatches": len(matches), "paths": matches,
        "scope": "Exact local credential matching in src/public/dist; credential values and identifiers are omitted from this report.",
    })
    assert not matches, "Exposed credential matches; see path-only report"
    print(json.dumps({"serving": "passed", "resources": len(checks), "memories": 44, "preservedResidents": len(expected_models), "credentialScan": "passed", "textFilesScanned": scanned}))


if __name__ == "__main__":
    main()
