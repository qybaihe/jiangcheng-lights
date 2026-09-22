#!/usr/bin/env python3
"""Read-only CDN check against the recorded deployment; never uses API tokens."""
import hashlib
import json
import os
import pathlib
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit

import httpx

ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "output/edgeone-release"
SITE = RELEASE / "site"
OUT = ROOT / os.environ.get("EDGEONE_HTTP_QA_DIR", "output/qa/edgeone-release/http")
OUT.mkdir(parents=True, exist_ok=True)
deployment = json.loads((RELEASE / "deployment.json").read_text())
preview = os.environ.get("EDGEONE_HTTP_BASE_URL") or deployment.get("publicUrl") or deployment["deployment"]["previewUrl"]
if urlsplit(preview).scheme != "https":
    raise ValueError("CDN verification requires HTTPS")
origin = "https://" + urlsplit(preview).netloc
report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "origin": origin,
          "deploymentId": deployment["deployment"]["deploymentId"], "checks": [],
          "scope": "This machine's network only; default-domain mainland preview expiry still applies."}


def check(client, path, *, signed=False, ranged=False):
    started = time.monotonic()
    headers = {"Accept-Encoding": "identity" if ranged else "gzip"}
    if ranged:
        headers["Range"] = "bytes=0-1023"
    response = client.get(preview if signed else origin + path, headers=headers)
    expected = (SITE / (path.lstrip("/") or "index.html")).read_bytes()
    if ranged:
        expected = expected[:1024]
    match = response.content == expected
    item = {"path": path, "signedEntry": bool(signed and urlsplit(preview).query), "range": ranged,
            "status": response.status_code, "seconds": round(time.monotonic() - started, 3),
            "decodedBytes": len(response.content), "matchesLocalArtifact": match,
            "headers": {k: v for k, v in response.headers.items() if k in {
                "content-type", "content-length", "content-encoding", "cache-control",
                "content-range", "accept-ranges", "etag", "server", "age",
                "x-content-type-options", "referrer-policy", "eo-cache-status"}},
            "sha256": hashlib.sha256(response.content).hexdigest()}
    item["passed"] = match and response.status_code == (206 if ranged else 200)
    if ranged:
        item["passed"] &= response.headers.get("content-range", "").startswith("bytes 0-1023/")
    report["checks"].append(item)
    print(json.dumps(item, ensure_ascii=False), flush=True)


try:
    with httpx.Client(timeout=90, follow_redirects=True) as client:
        check(client, "/", signed=True)
        check(client, "/")
        for file in sorted((SITE / "assets").iterdir()):
            check(client, "/" + str(file.relative_to(SITE)))
        for file in sorted((SITE / "media").rglob("*.json")):
            check(client, "/" + str(file.relative_to(SITE)))
        for path in ["/models/ayao.vrm", "/textures/paving-color.webp",
                     "/media/audio/bgm-explore.mp3", "/site.webmanifest", "/favicon.ico"]:
            check(client, path)
        for file in sorted((SITE / "media/playful-life-v1").glob("*.webp")):
            check(client, "/" + str(file.relative_to(SITE)))
        for file in sorted((SITE / "media").rglob("*.mp4")):
            check(client, "/" + str(file.relative_to(SITE)), ranged=True)
    report["passed"] = all(item["passed"] for item in report["checks"])
except Exception as exc:
    # URLs with the transient preview signature are not included in saved errors.
    report["error"] = type(exc).__name__
    report["passed"] = False
finally:
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"passed": report["passed"], "checks": len(report["checks"]),
                  "report": str(OUT / "report.json")}))
raise SystemExit(0 if report["passed"] else 1)
