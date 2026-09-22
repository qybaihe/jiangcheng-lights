"""Verify the locally served resident release without displaying credentials."""

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

from dotenv import dotenv_values


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/qa/resident-avatars-v3"
BASE = "http://127.0.0.1:4173"
OUT.mkdir(parents=True, exist_ok=True)
timestamp = datetime.now(timezone.utc).isoformat()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fetch(path):
    with urlopen(BASE + path, timeout=30) as response:
        assert response.status == 200, path
        return response.read()


def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


index = (ROOT / "dist/index.html").read_bytes()
assert fetch("/?v=residents-v3") == index, "The served HTML differs from dist"
paths = set(re.findall(r'(?:src|href)="(/[^"?#]+)', index.decode()))
manifest = json.loads((ROOT / "media/resident-model-sources.json").read_text())
expected = {resident["url"]: resident for resident in manifest["residents"]}
paths.update(expected)
paths.add("/models/residents/RESIDENT-LICENSE.md")
webmanifest = json.loads((ROOT / "public/site.webmanifest").read_text())
paths.update(icon["src"] for icon in webmanifest.get("icons", []))
checks = []
for path in sorted(paths):
    built = (ROOT / "dist" / path.lstrip("/")).read_bytes()
    assert fetch(path) == built, f"Served bytes differ: {path}"
    source = ROOT / "public" / path.lstrip("/")
    if source.exists():
        assert built == source.read_bytes(), f"Public/dist mismatch: {path}"
    sha256 = digest(built)
    if path in expected:
        assert sha256 == expected[path]["sha256"], f"Manifest hash mismatch: {path}"
        assert len(built) == expected[path]["outputBytes"], f"Manifest size mismatch: {path}"
    checks.append({"path": path, "sha256": sha256, "bytes": len(built)})

serving = {
    "status": "passed",
    "verifiedAt": timestamp,
    "url": BASE + "/?v=residents-v3",
    "indexSHA256": digest(index),
    "resourceChecks": checks,
    "residentCount": len(expected),
    "residentBytes": sum(r["outputBytes"] for r in expected.values()),
    "comparison": "served = dist; public resources also match source; nine models match source manifest",
}
write("production-serving.json", serving)

# Values stay in memory only. Reports include matched file paths, never names,
# values, snippets, or hashes of the credentials themselves.
secrets = {
    value for key, value in dotenv_values(ROOT / ".env").items()
    if re.search(r"KEY|TOKEN|SECRET|PASSWORD", key, re.I)
    and value and len(value) >= 12
}
assert secrets, "No credential values available to check"
extensions = {".js", ".mjs", ".cjs", ".ts", ".json", ".html", ".css", ".md", ".txt", ".svg", ".webmanifest", ".map", ".xml", ".yaml", ".yml"}
scanned, matches = 0, []
for directory in ("src", "public", "dist"):
    for file in (ROOT / directory).rglob("*"):
        if not file.is_file() or file.suffix.lower() not in extensions:
            continue
        content = file.read_text(errors="replace")
        scanned += 1
        if any(value in content for value in secrets):
            matches.append(str(file.relative_to(ROOT)))
scan = {
    "status": "failed" if matches else "passed",
    "verifiedAt": timestamp,
    "textFilesScanned": scanned,
    "secretMatches": len(matches),
    "paths": matches,
    "scope": "Exact matching of local credential values in src/public/dist text files",
}
write("credential-scan.json", scan)
assert not matches, "Credential scan found exposed values; see path-only report"
print(json.dumps({"serving": "passed", "resources": len(checks), "residents": len(expected), "credentialScan": "passed", "textFilesScanned": scanned}))
