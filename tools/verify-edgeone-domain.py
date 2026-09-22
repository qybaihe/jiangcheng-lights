#!/usr/bin/env python3
"""Read-only custom-domain DNS/TLS/entry checks using ordinary DNS and trust."""
import argparse
import datetime
import hashlib
import json
import pathlib
import socket
import ssl

import httpx

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--host", default="jcyd.classby.cn")
parser.add_argument("--out", default="output/qa/edgeone-release/submission-v1/custom-domain")
args = parser.parse_args()
out = ROOT / args.out
out.mkdir(parents=True, exist_ok=True)
now = datetime.datetime.now(datetime.timezone.utc)
stamp = now.strftime("%Y%m%dT%H%M%SZ")
report = {"checkedAt": now.isoformat(), "host": args.host, "dns": {}, "tls": {}, "entry": {},
          "scope": "Ordinary system DNS and validated HTTPS. Public DNS-over-HTTPS is diagnostic only; no --resolve, hosts override, or TLS bypass."}

with httpx.Client(timeout=20, follow_redirects=True) as client:
    for service, endpoint in [("google", "https://dns.google/resolve"),
                              ("cloudflare", "https://cloudflare-dns.com/dns-query")]:
        answers = []
        for qtype in ["CNAME", "A"]:
            try:
                r = client.get(endpoint, params={"name": args.host, "type": qtype},
                               headers={"Accept": "application/dns-json"})
                r.raise_for_status()
                answers.append({"type": qtype, "response": r.json()})
            except Exception as exc:
                answers.append({"type": qtype, "error": type(exc).__name__})
        report["dns"][service] = answers
    try:
        report["dns"]["systemAddresses"] = sorted({r[4][0] for r in socket.getaddrinfo(args.host, 443, type=socket.SOCK_STREAM)})
    except Exception as exc:
        report["dns"]["systemError"] = type(exc).__name__
    try:
        context = ssl.create_default_context()
        context.set_alpn_protocols(["h2", "http/1.1"])
        with socket.create_connection((args.host, 443), timeout=30) as sock:
            with context.wrap_socket(sock, server_hostname=args.host) as tls:
                cert = tls.getpeercert()
                report["tls"] = {"passed": True, "trustAndHostnameVerified": True,
                    "version": tls.version(), "alpn": tls.selected_alpn_protocol(),
                    "cipher": tls.cipher(), "subject": cert.get("subject"),
                    "issuer": cert.get("issuer"), "subjectAltName": cert.get("subjectAltName"),
                    "notBefore": cert.get("notBefore"), "notAfter": cert.get("notAfter")}
    except Exception as exc:
        report["tls"] = {"passed": False, "error": type(exc).__name__, "message": str(exc)}
    try:
        r = client.get("https://" + args.host + "/")
        expected = (ROOT / "output/edgeone-release/site/index.html").read_bytes()
        report["entry"] = {"status": r.status_code, "finalUrl": str(r.url),
            "bytes": len(r.content), "sha256": hashlib.sha256(r.content).hexdigest(),
            "matchesRelease": r.content == expected,
            "passed": r.status_code == 200 and r.content == expected}
    except Exception as exc:
        report["entry"] = {"passed": False, "error": type(exc).__name__}
report["passed"] = report["tls"].get("passed", False) and report["entry"].get("passed", False)
body = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
(out / ("domain-" + stamp + ".json")).write_text(body)
(out / "domain-latest.json").write_text(body)
print(body)
raise SystemExit(0 if report["passed"] else 1)
