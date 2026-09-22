#!/usr/bin/env python3
"""Generate resumable, exact-text dialogue recordings using fixed neural voices.

    uv run --with edge-tts==7.2.8 python tools/story_voice.py audition
    uv run --with edge-tts==7.2.8 python tools/story_voice.py generate
    python tools/story_voice.py verify

Only the public dialogue text is sent to Microsoft's Edge Read Aloud service.
This script does not read .env, browser cookies, or local authentication stores.
"""

from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import fcntl
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "output/audio/story-voice-v3"
PUBLIC = ROOT / "public/media/story-voice"
MANIFEST = WORK / "staged-manifest.json"
RELEASE_MANIFEST = ROOT / "public/media/story-voice-manifest.json"
LEGACY_JOBS = ROOT / "output/audio/story-voice/jobs.json"
JOBS = WORK / "jobs.json"
PROVIDER = "microsoft-edge-read-aloud"
CLIENT = "edge-tts"
CLIENT_VERSION = "7.2.8"
ENCODING = {"codec": "mp3", "sampleRate": 48000, "channels": 1, "bitrate": 96000}
NORMALIZATION = {"integratedLufs": -19, "truePeakDbtp": -2, "loudnessRangeLu": 9}

# Stable character identities. Memory scenes retain the same neural voice.
# All profiles use mainland standard Mandarin. Female NPCs share a base voice;
# their fixed prosody profiles distinguish pacing, not cloned actor identities.
VOICES = {
    "narrator": {"voiceId": "zh-CN-XiaoxiaoNeural", "locale": "zh-CN", "rate": "-6%", "pitch": "+0Hz", "description": "旁白，沉静、留白的普通话女声"},
    "ayao-female": {"voiceId": "zh-CN-XiaoyiNeural", "locale": "zh-CN", "rate": "-3%", "pitch": "-2Hz", "description": "成年阿遥女声，年轻自然"},
    "ayao-male": {"voiceId": "zh-CN-YunxiNeural", "locale": "zh-CN", "rate": "-5%", "pitch": "-2Hz", "description": "成年阿遥男声，年轻自然"},
    "grandpa": {"voiceId": "zh-CN-YunyangNeural", "locale": "zh-CN", "rate": "-8%", "pitch": "-4Hz", "description": "外公，温和低声；标准音色经轻度韵律调整，不是老年克隆"},
    "granny": {"voiceId": "zh-CN-XiaoxiaoNeural", "locale": "zh-CN", "rate": "-11%", "pitch": "-7Hz", "description": "林婆婆，低缓温和；标准女声轻调韵律，不伪称老年克隆"},
    "chef": {"voiceId": "zh-CN-XiaoxiaoNeural", "locale": "zh-CN", "rate": "+3%", "pitch": "-3Hz", "description": "蔡姨，明亮干脆，稍快的生活口吻"},
    "dock": {"voiceId": "zh-CN-YunjianNeural", "locale": "zh-CN", "rate": "-8%", "pitch": "-5Hz", "description": "周伯，厚实男声，放慢节奏"},
    "community": {"voiceId": "zh-CN-XiaoxiaoNeural", "locale": "zh-CN", "rate": "-1%", "pitch": "+2Hz", "description": "小许，清楚、亲近的普通话女声"},
    "child": {"voiceId": "zh-CN-YunxiaNeural", "locale": "zh-CN", "rate": "-5%", "pitch": "+2Hz", "description": "童年阿遥，偏少年的轻亮声线，男女主共用"},
}
SPEAKERS = {
    "旁白": "narrator", "外公": "grandpa", "外公的字条": "grandpa", "年轻的外公": "grandpa",
    "林婆婆": "granny", "年轻的林婆婆": "granny", "那年的林婆婆": "granny",
    "蔡姨": "chef", "年轻的蔡姨": "chef", "周伯": "dock", "年轻的周伯": "dock",
    "小许": "community", "去年的小许": "community", "童年的阿遥": "child",
}
MEMORY_RATES = {"年轻的外公": "-4%", "年轻的林婆婆": "-6%", "那年的林婆婆": "-6%", "年轻的蔡姨": "+1%", "年轻的周伯": "-5%"}
AUDITION_IDS = {
    "narrator": "intro-clock", "ayao-female": "ending-next-breakfast", "ayao-male": "ending-next-breakfast",
    "grandpa": "ending-grandpa-checkin", "granny": "granny-recognition", "chef": "chef-intro-anytime",
    "dock": "dock-greeting", "community": "checked-not-only-worker", "child": "ending-memory-child-question",
}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def file_digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, tmp = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write("\n")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def read_json(path, fallback):
    return json.loads(path.read_text()) if path.exists() else fallback


def get_lines():
    source = "import {DIALOGUES,EXTRA_DIALOGUES} from './src/story.js'; import {ENDING_DIALOGUES} from './src/ending-v3-data.js'; console.log(JSON.stringify(Object.entries({...DIALOGUES,...EXTRA_DIALOGUES,...ENDING_DIALOGUES}).flatMap(([scene,lines]) => lines.filter(line=>!line.silent).map(line=>({...line,scene})))));"
    result = subprocess.run(["node", "--input-type=module", "-e", source], cwd=ROOT, check=True, capture_output=True, text=True)
    lines = json.loads(result.stdout)
    seen = set()
    for line in lines:
        if not re.fullmatch(r"[a-z0-9-]+", line.get("id", "")) or line["id"] in seen:
            raise ValueError("Missing, unsafe, or duplicate story line ID")
        if not line.get("text") or (line["who"] != "阿遥" and line["who"] not in SPEAKERS):
            raise ValueError(f"Unmapped speaker/empty text: {line['id']}")
        seen.add(line["id"])
    return lines


def make_tasks(lines):
    tasks = []
    for line in lines:
        variants = {"female": "ayao-female", "male": "ayao-male"} if line["who"] == "阿遥" else {"default": SPEAKERS[line["who"]]}
        for variant, profile_id in variants.items():
            profile = dict(VOICES[profile_id])
            if line["who"] in MEMORY_RATES:
                profile["rate"] = MEMORY_RATES[line["who"]]
            elif line.get("time") == "memory":
                # Approved v3 speakers use their plain names, not '年轻的…'.
                memory_name = ("那年的" if line["scene"] == "towel" else "年轻的") + line["who"]
                if memory_name in MEMORY_RATES:
                    profile["rate"] = MEMORY_RATES[memory_name]
            text_sha = digest(line["text"])
            spec = {"provider": PROVIDER, "client": CLIENT, "clientVersion": CLIENT_VERSION, "voice": profile, "textSha256": text_sha, "encoding": ENCODING, "normalization": NORMALIZATION}
            job_sha = digest(json.dumps(spec, sort_keys=True, ensure_ascii=False))
            key = f"{line['id']}:{variant}:{job_sha[:16]}"
            filename = f"{line['id']}.{variant}.{job_sha[:12]}.mp3"
            tasks.append({"key": key, "line": line, "variant": variant, "profileId": profile_id, "profile": profile, "sha256": text_sha, "jobSha256": job_sha, "filename": filename})
    return tasks


def probe(path, decode=False):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_name,sample_rate,channels", "-of", "json", str(path)], check=True, capture_output=True, text=True)
    data = json.loads(result.stdout)
    duration = float(data["format"]["duration"])
    if not math.isfinite(duration) or duration < 0.25 or duration > 150:
        raise ValueError(f"Implausible speech duration: {duration}")
    if decode:
        subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(path), "-f", "null", "-"], check=True, capture_output=True)
    return {"duration": round(duration, 3), "bytes": int(data["format"]["size"]), **data["streams"][0]}


def measure_encoded_loudness(path):
    result = subprocess.run(["ffmpeg", "-hide_banner", "-xerror", "-i", str(path), "-af", "loudnorm=I=-19:TP=-2:LRA=9:print_format=json", "-f", "null", "-"], check=True, capture_output=True, text=True)
    match = re.findall(r'\{\s*"input_i".*?\}', result.stderr, flags=re.S)
    if not match:
        raise ValueError("Missing encoded loudness analysis")
    measured = json.loads(match[-1])
    value = {"integratedLufs": float(measured["input_i"]), "truePeakDbtp": float(measured["input_tp"])}
    if not all(math.isfinite(x) for x in value.values()):
        raise ValueError("Non-finite encoded loudness")
    return value


def repair_encoded_level(path, measured=None):
    """Keep unusually transient short lines audible without exceeding peak headroom."""
    measured = measured or measure_encoded_loudness(path)
    if abs(measured["integratedLufs"] + 19) <= 1.5 and measured["truePeakDbtp"] <= -2:
        return measured, None
    before_sha = file_digest(path)
    gain_db = max(-6, min(6, -19 - measured["integratedLufs"]))
    repaired = path.with_suffix(".level-repair.mp3")
    # Short acknowledgements ('好。') have unusually high transient/average ratios.
    # Re-encode bounded candidate gains from the SAME source, never cumulatively;
    # choose by the measured MP3, not the pre-encoding filter estimate.
    candidates = [gain_db]
    if measured["integratedLufs"] < -20.5:
        candidates += [max(gain_db, 8), 10]
    accepted = None
    for candidate in dict.fromkeys(candidates):
        af = f"aresample=192000,volume={candidate:.3f}dB,alimiter=limit=0.749894:level=false:latency=true,aresample=48000"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-xerror", "-i", str(path), "-af", af, "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", str(repaired)], check=True, capture_output=True)
        after = measure_encoded_loudness(repaired)
        if after["truePeakDbtp"] <= -2 and abs(after["integratedLufs"] + 19) <= 2.5:
            accepted = (candidate, after, repaired.read_bytes())
            if abs(after["integratedLufs"] + 19) <= 1.5:
                break
    if accepted is None:
        repaired.unlink(missing_ok=True)
        raise ValueError("Short-line level correction did not meet loudness/peak limits")
    gain_db, after, audio = accepted
    repaired.write_bytes(audio)
    os.replace(repaired, path)
    return after, {"method": "oversampled bounded gain and lookahead limiter", "gainDb": round(gain_db, 3), "before": measured, "beforeSha256": before_sha, "after": after}


def normalize(raw, destination):
    base = "loudnorm=I=-19:TP=-2:LRA=9"
    analysis = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(raw), "-af", base + ":print_format=json", "-f", "null", "-"], check=True, capture_output=True, text=True)
    match = re.findall(r'\{\s*"input_i".*?\}', analysis.stderr, flags=re.S)
    if not match:
        raise ValueError("Missing measured loudness")
    measured = json.loads(match[-1])
    if not all(math.isfinite(float(measured[key])) for key in ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"]):
        raise ValueError("Silent or invalid synthesized voice")
    af = base + ":measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}:linear=true:print_format=json".format(**measured)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".part.mp3")
    result = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-i", str(raw), "-af", af, "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", str(temporary)], check=True, capture_output=True, text=True)
    info = probe(temporary, decode=True)
    if info["codec_name"] != "mp3" or int(info["sample_rate"]) != 48000 or info["channels"] != 1:
        raise ValueError("Unexpected encoded voice format")
    os.replace(temporary, destination)
    output_match = re.findall(r'\{\s*"input_i".*?\}', result.stderr, flags=re.S)
    info["normalization"] = {"target": NORMALIZATION, "measurement": json.loads(output_match[-1]) if output_match else measured}
    encoded, repair = repair_encoded_level(destination)
    info.update(probe(destination))
    info["normalization"]["encodedMeasurement"] = encoded
    if repair:
        info["normalization"]["levelRepair"] = repair
    info["audioSha256"] = file_digest(destination)
    return info


def repair_levels(lines, tasks):
    state = read_json(JOBS, {"jobs": {}})
    repaired = []
    with (WORK / "generation.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Wait for the active generation process before repairing levels")
        for task in tasks:
            job = state["jobs"].get(task["key"])
            if not job_valid(task, job, full=True):
                continue
            path = PUBLIC / task["filename"]
            encoded, correction = repair_encoded_level(path)
            job["normalization"]["encodedMeasurement"] = encoded
            if correction:
                job["normalization"]["levelRepair"] = correction
                job.update(probe(path))
                job["audioSha256"] = file_digest(path)
                job["updatedAt"] = now()
                repaired.append({"id": task["line"]["id"], "variant": task["variant"], **correction})
                print(f"LEVEL {task['line']['id']} [{task['variant']}] {encoded}", flush=True)
            atomic_json(JOBS, state)
        publish_manifest(lines, tasks, state)
    atomic_json(WORK / "level-repairs.json", {"createdAt": now(), "repairs": repaired})
    print(f"Level pass complete: {len(repaired)} short/transient lines corrected", flush=True)
    return 0


def job_valid(task, job, *, full=False):
    if not job or job.get("status") != "succeeded" or job.get("textSha256") != task["sha256"] or job.get("jobSha256") != task["jobSha256"]:
        return False
    path = PUBLIC / task["filename"]
    if not path.is_file() or path.stat().st_size != job.get("bytes"):
        return False
    if full and file_digest(path) != job.get("audioSha256"):
        return False
    return True


def publish_manifest(lines, tasks, state):
    records = {}
    for task in tasks:
        job = state["jobs"].get(task["key"])
        if not job_valid(task, job, full=True):
            continue
        line = task["line"]
        record = records.setdefault(line["id"], {"text": line["text"], "sha256": task["sha256"], "speaker": line["who"], "scene": line["scene"], "time": line.get("time", "present"), "variants": {}})
        record["variants"][task["variant"]] = {
            "url": f"/media/story-voice/{task['filename']}", "duration": job["duration"], "voiceId": task["profile"]["voiceId"],
            "profileId": task["profileId"], "rate": task["profile"]["rate"], "pitch": task["profile"]["pitch"],
            "audioSha256": job["audioSha256"], "bytes": job["bytes"], "provider": PROVIDER, "clientVersion": CLIENT_VERSION,
        }
    source_sha = digest(json.dumps([{k: l.get(k) for k in ("id", "who", "text", "time")} for l in lines], ensure_ascii=False, separators=(",", ":")))
    payload = {"version": 1, "storyVersion": 3, "generatedAt": now(), "source": "src/story.js:DIALOGUES+EXTRA_DIALOGUES;src/ending-v3-data.js:ENDING_DIALOGUES (silent actions excluded)", "sourceSha256": source_sha,
        "provider": {"id": PROVIDER, "service": "Microsoft Edge Read Aloud", "client": CLIENT, "clientVersion": CLIENT_VERSION,
            "transport": "Edge Speech WebSocket via edge-tts", "authentication": "No project credential or browser cookies used", "limitations": "Unofficial Edge client; no API SLA. Mainland standard Mandarin neural voices, not voice clones or Wuhan dialect. Narrator and female NPCs share Xiaoxiao with fixed per-role rate/pitch profiles."},
        "encoding": ENCODING, "normalization": NORMALIZATION, "voices": VOICES, "lines": records,
        "coverage": {"expectedLines": len(lines), "availableLines": len(records), "expectedVariants": len(tasks), "availableVariants": sum(len(r["variants"]) for r in records.values())}}
    atomic_json(MANIFEST, payload)
    return payload


def reuse_exact_audio(tasks, state):
    """Reuse only byte-verified legacy audio with identical text AND full voice spec."""
    legacy = read_json(LEGACY_JOBS, {"jobs": {}})
    candidates = {}
    for job in legacy["jobs"].values():
        if job.get("status") == "succeeded":
            candidates.setdefault(job.get("jobSha256"), []).append(job)
    count = 0
    for task in tasks:
        if job_valid(task, state["jobs"].get(task["key"]), full=True):
            continue
        for old in candidates.get(task["jobSha256"], []):
            source = ROOT / old.get("outputFile", "missing")
            if old.get("textSha256") != task["sha256"] or not source.is_file() or file_digest(source) != old.get("audioSha256"):
                continue
            destination = PUBLIC / task["filename"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            if source != destination:
                shutil.copyfile(source, destination)
            state["jobs"][task["key"]] = {**old, "lineId": task["line"]["id"], "variant": task["variant"],
                "outputFile": str(destination.relative_to(ROOT)), "reusedFrom": str(source.relative_to(ROOT)), "updatedAt": now()}
            count += 1
            break
    return count


async def synthesize(task, state, semaphore, save, destination=None):
    import edge_tts

    async with semaphore:
        raw = WORK / "raw" / task["filename"]
        raw.parent.mkdir(parents=True, exist_ok=True)
        final = destination or PUBLIC / task["filename"]
        job = state["jobs"].setdefault(task["key"], {})
        job.update({"lineId": task["line"]["id"], "variant": task["variant"], "text": task["line"]["text"], "textSha256": task["sha256"], "jobSha256": task["jobSha256"],
            "voiceId": task["profile"]["voiceId"], "profileId": task["profileId"], "rate": task["profile"]["rate"], "pitch": task["profile"]["pitch"], "provider": PROVIDER,
            "client": CLIENT, "clientVersion": CLIENT_VERSION, "sourceFile": str(raw.relative_to(ROOT)), "outputFile": str(final.relative_to(ROOT))})
        for attempt in range(1, 4):
            job.update({"status": "running", "attempts": job.get("attempts", 0) + 1, "updatedAt": now()})
            save()
            try:
                if not raw.exists():
                    partial = raw.with_suffix(".download.part")
                    # Edge supports only these bounded prosody controls. Do not invent emotion, age, seed or cloning parameters.
                    communicate = edge_tts.Communicate(task["line"]["text"], voice=task["profile"]["voiceId"], rate=task["profile"]["rate"], pitch=task["profile"]["pitch"], connect_timeout=20, receive_timeout=90)
                    await asyncio.wait_for(communicate.save(str(partial)), timeout=120)
                    await asyncio.to_thread(probe, partial, True)
                    os.replace(partial, raw)
                info = await asyncio.to_thread(normalize, raw, final)
                job.update(info)
                job.update({"status": "succeeded", "updatedAt": now(), "rawSha256": file_digest(raw)})
                job.pop("error", None)
                save()
                print(f"OK {task['line']['id']} [{task['variant']}] {info['duration']:.2f}s", flush=True)
                return True
            except Exception as exc:
                # Never persist HTTP response bodies, request headers, tokens or credentials.
                job.update({"status": "retrying" if attempt < 3 else "failed", "error": type(exc).__name__, "updatedAt": now()})
                save()
                print(f"RETRY {task['line']['id']} [{task['variant']}] {type(exc).__name__} ({attempt}/3)", flush=True)
                if attempt < 3:
                    await asyncio.sleep(2 ** attempt + 1)
        return False


async def generate(args, lines, tasks):
    installed = importlib.metadata.version(CLIENT)
    if installed != CLIENT_VERSION:
        raise RuntimeError(f"Use the pinned client: uv run --with {CLIENT}=={CLIENT_VERSION} python tools/story_voice.py {args.command}")
    WORK.mkdir(parents=True, exist_ok=True)
    with (WORK / "generation.lock").open("w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another story voice generation process holds the lock")
        if args.command == "audition":
            selected = []
            for profile in VOICES:
                options = [t for t in tasks if t["profileId"] == profile]
                if not options:
                    continue
                selected.append(next((t for t in options if t["line"]["id"] == AUDITION_IDS[profile]), options[0]))
            state_path = WORK / "auditions/jobs.json"
        else:
            selected = tasks
            if args.ids:
                wanted = set(args.ids.split(","))
                selected = [t for t in selected if t["line"]["id"] in wanted]
            if args.limit:
                selected = selected[:args.limit]
            state_path = JOBS
        state = read_json(state_path, {"version": 1, "createdAt": now(), "jobs": {}})
        if args.command != "audition":
            print(f"Exact legacy assets reused: {reuse_exact_audio(selected, state)}", flush=True)

        def save():
            state["updatedAt"] = now()
            atomic_json(state_path, state)
            if args.command != "audition":
                publish_manifest(lines, tasks, state)

        semaphore = asyncio.Semaphore(args.concurrency)
        pending = []
        for task in selected:
            destination = WORK / "auditions" / f"{task['profileId']}.mp3" if args.command == "audition" else None
            if destination:
                old = state["jobs"].get(task["key"], {})
                skip = old.get("status") == "succeeded" and destination.exists() and file_digest(destination) == old.get("audioSha256")
            else:
                skip = job_valid(task, state["jobs"].get(task["key"]), full=True)
            if skip:
                continue
            pending.append(synthesize(task, state, semaphore, save, destination))
        print(f"{args.command}: {len(selected)} expected, {len(selected) - len(pending)} reusable, {len(pending)} to generate", flush=True)
        results = await asyncio.gather(*pending)
        save()
        if args.command == "audition":
            preview = {"version": 1, "createdAt": now(), "provider": PROVIDER, "clientVersion": CLIENT_VERSION, "samples": []}
            for task in selected:
                job = state["jobs"].get(task["key"], {})
                if job.get("status") == "succeeded":
                    preview["samples"].append({"profileId": task["profileId"], "voiceId": task["profile"]["voiceId"], "lineId": task["line"]["id"], "text": task["line"]["text"], "file": job["outputFile"], "duration": job["duration"]})
            atomic_json(WORK / "auditions/manifest.json", preview)
        else:
            print(json.dumps(publish_manifest(lines, tasks, state)["coverage"], ensure_ascii=False), flush=True)
        return 0 if all(results) else 2


def verify(lines, tasks):
    state = read_json(JOBS, {"jobs": {}})
    errors = []
    durations = {"female": 0.0, "male": 0.0}
    size = 0
    loudness_records = []
    for task in tasks:
        job = state["jobs"].get(task["key"])
        if not job_valid(task, job, full=True):
            errors.append({"id": task["line"]["id"], "variant": task["variant"], "reason": "missing_or_stale_job_or_asset"})
            continue
        try:
            info = probe(PUBLIC / task["filename"], decode=True)
            encoded_level = measure_encoded_loudness(PUBLIC / task["filename"])
            loudness_records.append({"id": task["line"]["id"], "variant": task["variant"], **encoded_level})
            if encoded_level["truePeakDbtp"] > -1.8:
                raise ValueError("Encoded true peak exceeds the -2 dBTP target tolerance (0.2 dB)")
            if abs(encoded_level["integratedLufs"] - NORMALIZATION["integratedLufs"]) > 2.5:
                raise ValueError("Encoded loudness differs from target by more than 2.5 LU")
            if abs(info["duration"] - job["duration"]) > 0.01:
                raise ValueError("Duration mismatch")
            for gender in durations:
                if task["variant"] in ("default", gender):
                    durations[gender] += info["duration"]
            size += info["bytes"]
        except Exception as exc:
            errors.append({"id": task["line"]["id"], "variant": task["variant"], "reason": type(exc).__name__})
    payload = publish_manifest(lines, tasks, state)
    report = {"verifiedAt": now(), "pass": not errors, "coverage": payload["coverage"], "totalBytes": size, "dialogueSecondsByPlayerVoice": {k: round(v, 3) for k,v in durations.items()}, "errors": errors,
        "encodedLoudness": {"files": len(loudness_records), "minIntegratedLufs": min((x["integratedLufs"] for x in loudness_records), default=None), "maxIntegratedLufs": max((x["integratedLufs"] for x in loudness_records), default=None), "maxTruePeakDbtp": max((x["truePeakDbtp"] for x in loudness_records), default=None)},
        "checked": ["Exact UTF-8 story text hashes", "Stable line IDs and character voice mapping", "Audio SHA-256", "Every file fully decoded with ffmpeg -xerror", "Nonzero finite durations", f"{len(lines)}-line coverage and player gender variants", "Encoded integrated loudness and true peak"],
        "notClaimed": ["Human acting or Wuhan dialect", "Human listening approval of every line", "Independent ASR verification of every word"]}
    atomic_json(WORK / "verification.json", report)
    atomic_json(WORK / "encoded-loudness.json", loudness_records)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not errors else 2


def release(lines, tasks):
    """Atomically activate only a complete, freshly verified staged manifest."""
    if verify(lines, tasks):
        raise RuntimeError("Voice release requires every current line to pass verification")
    payload = read_json(MANIFEST, {})
    coverage = payload["coverage"]
    if coverage["availableLines"] != len(lines) or coverage["availableVariants"] != len(tasks):
        raise RuntimeError("Incomplete voice manifest cannot replace the live manifest")
    if RELEASE_MANIFEST.exists():
        backup = WORK / "previous-live-manifest.json"
        if not backup.exists():
            shutil.copyfile(RELEASE_MANIFEST, backup)
    atomic_json(RELEASE_MANIFEST, payload)
    atomic_json(WORK / "release.json", {"releasedAt": now(), "manifestSha256": file_digest(RELEASE_MANIFEST), "coverage": coverage})
    print("Released complete v3 voice manifest atomically", flush=True)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["audition", "generate", "verify", "repair-levels", "status", "release"])
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--ids", help="Optional comma-separated exact line IDs")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    if not 1 <= args.concurrency <= 4:
        parser.error("Concurrency must be between 1 and 4")
    lines = get_lines()
    tasks = make_tasks(lines)
    if args.command in ("audition", "generate"):
        return asyncio.run(generate(args, lines, tasks))
    if args.command == "verify":
        return verify(lines, tasks)
    if args.command == "repair-levels":
        return repair_levels(lines, tasks)
    if args.command == "release":
        return release(lines, tasks)
    state = read_json(JOBS, {"jobs": {}})
    complete = sum(job_valid(task, state["jobs"].get(task["key"])) for task in tasks)
    print(json.dumps({"lines": len(lines), "variants": len(tasks), "complete": complete, "pending": len(tasks)-complete, "voices": VOICES}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
