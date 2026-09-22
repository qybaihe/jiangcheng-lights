"""Independent inspection of the actual v3 master, with credential-free reports.

Signal/byte verification is local. Optional model-assisted audiovisual review
sends only a derived review carrier to the project's existing media gateway.
It is supplementary review, not a claim of human headphone listening.
"""
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlencode
import argparse
import base64
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/qa/submission-v3"
BASELINE = ROOT / "output/demo-film-v2/江城有灯-比赛Demo-1080p-v2.mp4"
EXPECTED_V2 = "3a64249377d2663f55300f9e7bf21f9560cb44b0bc360683ce97768ab13a8b80"
FF = "/opt/homebrew/bin/ffmpeg"


def sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def digest_audio(path, *, packets):
    args = [FF, "-v", "error", "-i", str(path), "-map", "0:a:0"]
    args += (["-c:a", "copy"] if packets else ["-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2"])
    return run(args + ["-f", "hash", "-hash", "sha256", "-"]).stdout.strip()


def local_checks(film):
    assert sha(BASELINE) == EXPECTED_V2, "Previously approved v2 was modified"
    result = {"source": str(film.relative_to(ROOT)), "sourceSha256": sha(film),
              "checkedAt": datetime.now(timezone.utc).isoformat(), "v2Preserved": True}
    for mode in ("aacPackets", "decodedPCM"):
        baseline = digest_audio(BASELINE, packets=mode == "aacPackets")
        revised = digest_audio(film, packets=mode == "aacPackets")
        assert baseline == revised, f"Audio differs: {mode}"
        result[mode] = {"equal": True, "sha256": revised}
    old = json.loads((ROOT / "output/demo-film-v2/edit-decision.json").read_text())
    new = json.loads((ROOT / "output/demo-film-v3/edit-decision.json").read_text())
    assert old["duration"] == new["duration"] == 118
    assert old["captions"] == new["captions"], "Narration subtitle timing/content changed"
    assert [(c["id"], c["from"], c["duration"], c["volume"]) for c in old["voice"]] == [
        (c["id"], c["from"], c["duration"], c["volume"]) for c in new["voice"]]
    result["narrationCaptionsUnchanged"] = True
    result["voiceTimingUnchanged"] = True
    windows = [(43, 47), (51.5, 54.5), (73, 77)]
    render_keys = ("id", "type", "from", "duration", "src", "sourceIn", "playbackRate",
                   "title", "detail", "chapter", "gameVolume", "closing", "secondary", "waveform")
    unchanged = 0
    for shot in old["shots"]:
        if any(start <= shot["from"] < end for start, end in windows):
            continue
        matches = [s for s in new["shots"] if s["from"] == shot["from"] and s["duration"] == shot["duration"]]
        assert len(matches) == 1, "Unexpected timeline changes outside three agreed windows"
        assert all(shot.get(key) == matches[0].get(key) for key in render_keys), shot["id"]
        unchanged += 1
    result["unchangedShotsOutsideRevision"] = unchanged
    result["newShotWindows"] = [
        {"from": s["from"], "duration": s["duration"], "title": s.get("title"), "src": s.get("src")}
        for s in new["shots"] if 43 <= s["from"] < 47 or 51.5 <= s["from"] < 54.5 or 73 <= s["from"] < 77]
    result["status"] = "pass"
    target = OUT / "root-audio-and-timeline-check.json"
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False))


def make_stills(film):
    from PIL import Image, ImageDraw, ImageFont
    times = [0.8, 7.8, 21.8, 31.8, 42.5, 43.7, 44.8, 46.4,
             51.1, 51.9, 52.7, 53.9, 72.5, 73.6, 74.8, 76.4,
             78, 81, 89, 94, 98, 105, 113, 116.5]
    dest = OUT / "actual-master-frames"
    dest.mkdir(exist_ok=True)
    sheet = Image.new("RGB", (1600, 4 * 252 + 2 * 252), "#172820")
    draw = ImageDraw.Draw(sheet)
    for index, t in enumerate(times):
        path = dest / f"{t:06.2f}s.png"
        run([FF, "-y", "-v", "error", "-ss", str(t), "-i", str(film), "-frames:v", "1", str(path)])
        image = Image.open(path).convert("RGB")
        image.thumbnail((400, 225))
        x, y = index % 4 * 400, index // 4 * 252
        sheet.paste(image, (x, y))
        draw.text((x + 10, y + 230), f"ACTUAL MASTER  {t:.2f}s", fill="#f2e1b4")
    target = OUT / "actual-master-contact.jpg"
    sheet.save(target, quality=92)
    print(str(target))


def model_review(film, mode):
    import httpx
    from media import ENV
    prompts = {
        "audio": """Listen to the actual complete soundtrack in this intentionally blank 118-second video. No expected transcript is given. Return compact JSON only: audioAccessible:boolean, heardSpeech:[{approxTime,text,speaker}], narratorConsistency:{consistent:boolean,evidence}, conversationalDelivery, unnaturalMoments:[], clippedWords:[], maskingOrOverlap:[], musicBalance, endingComplete:boolean, passOrRevise, uncertainties. Transcribe only actually heard Chinese words. Do not infer missing content. One sentence group per row, not every word. A native game character can differ from the narrator. Report genuine issues, leave empty arrays when none. Do not claim access if audio is inaccessible. Times are approximate, never substitute for exact subtitles. Keep response below 3300 tokens.""",
        "new-gameplay": """Inspect this actual edited film excerpt. Its first 16 seconds come from master 39–55 seconds; its next 17 seconds come from master 71–88 seconds. This is one direct splice, not an imagined continuous gameplay run. Report compact JSON only: videoAccessible:boolean, observedActions:[{excerptTime,visibleAction,evidence}], photoInteractionVisible, mealPackingVisible, deliveryVisible, captionsAccurate, voiceImageFit, illegibleOrOccludedUI:[], misleadingCompletionClaims:[], distractingTransitions:[], passOrRevise, uncertainties. Read and compare native game UI and editorial captions when legible, do not infer actual success from editorial titles alone. Pay attention to whether meal boxes are prepared, whether a photo is positioned against a 3D scene, whether a food delivery visibly occurs, whether narration fits the picture. Short montage may compress actions and need not show entire puzzles. Do not demand voiceover for every button press. These are actual edited video bytes; do not invent expected actions. Timestamps relative to 33-second carrier. Keep response below 2600 tokens.""",
    }
    prompt = prompts[mode]
    source_sha = sha(film)
    target = OUT / f"{mode}-actual-review-{source_sha[:12]}.json"
    fingerprint = hashlib.sha256(prompt.encode()).hexdigest()
    if target.exists():
        previous = json.loads(target.read_text())
        assert previous["sourceSha256"] == source_sha and previous["promptSha256"] == fingerprint
        print(json.dumps(previous, ensure_ascii=False))
        return
    carrier = OUT / f"{mode}-carrier-{source_sha[:12]}.mp4"
    if mode == "audio":
        run([FF, "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x172820:s=320x180:r=30",
             "-i", str(film), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "ultrafast",
             "-pix_fmt", "yuv420p", "-c:a", "copy", "-t", "118", "-movflags", "+faststart", str(carrier)])
    else:
        filters = ("[0:v]trim=start=39:end=55,setpts=PTS-STARTPTS,scale=1280:720[v0];"
                   "[0:a]atrim=start=39:end=55,asetpts=PTS-STARTPTS[a0];"
                   "[0:v]trim=start=71:end=88,setpts=PTS-STARTPTS,scale=1280:720[v1];"
                   "[0:a]atrim=start=71:end=88,asetpts=PTS-STARTPTS[a1];"
                   "[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]")
        run([FF, "-y", "-v", "error", "-i", str(film), "-filter_complex", filters,
             "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "19", "-preset", "fast", "-threads", "2",
             "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(carrier)])
    endpoint = "https://" + ENV.get("MODEL_GATEWAY_HOST", "aidp-i18ntt-sg.tiktok-row.net") + \
        "/api/modelhub/online/v2/crawl?" + urlencode({"ak": ENV["GPT_AK"]})
    payload = {"model": ENV.get("GEMINI_MODEL", "gemini-3.5-flash"), "stream": False, "max_tokens": 5200,
               "messages": [{"role": "user", "content": [{"type": "text", "text": prompt},
                   {"type": "file_url", "file_url": {"mime_type": "video/mp4",
                       "url": base64.b64encode(carrier.read_bytes()).decode(),
                       "extra": json.dumps({"videoMetaData": {"fps": 1 if mode == "audio" else 6}})}}]}]}
    response = httpx.post(endpoint, json=payload, timeout=300)
    if not response.is_success:
        raise RuntimeError(f"Review gateway HTTP {response.status_code}")
    raw = response.json()["choices"][0]["message"]["content"]
    if isinstance(raw, list):
        raw = "".join(item.get("text", "") for item in raw if isinstance(item, dict))
    raw = str(raw).strip()
    (OUT / f"{mode}-response-{source_sha[:12]}.txt").write_text(raw)
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    result = {"reviewedAt": datetime.now(timezone.utc).isoformat(), "method": "model-assisted actual-file review; not human listening",
              "source": str(film.relative_to(ROOT)), "sourceSha256": source_sha,
              "carrier": str(carrier.relative_to(ROOT)), "carrierSha256": sha(carrier),
              "promptSha256": fingerprint, "expectedTranscriptHidden": True,
              "observation": json.loads(raw)}
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["local", "stills", "audio", "new-gameplay"])
    parser.add_argument("--film", type=Path, default=ROOT / "output/demo-film-v3/江城有灯-比赛Demo-1080p-v3.mp4")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        film = args.film.resolve()
        if args.mode == "local":
            local_checks(film)
        elif args.mode == "stills":
            make_stills(film)
        else:
            model_review(film, args.mode)
    except Exception as error:
        # No authenticated request URLs, response dumps, or environment values in logs.
        print(type(error).__name__ + ": final master review failed; details omitted", file=sys.stderr)
        raise SystemExit(1)
