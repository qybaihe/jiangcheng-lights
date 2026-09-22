#!/usr/bin/env python3
"""Optimize only the five EdgeOne release-copy CGs; source media stays untouched.

Run with .venv/bin/python tools/optimize-edgeone-cg.py. Encodes at most two
videos simultaneously, with four encoder threads per process. All frame timing,
full decode, and SSIM checks must pass before a release file is replaced.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import re
import struct
import subprocess
import time
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/media/cinema-upscale-v1"
RELEASE = ROOT / "output/edgeone-release/site/media/cinema-upscale-v1"
AUDIT = ROOT / "output/edgeone-release/audit"
WORK = AUDIT / "video-optimization"
FFMPEG = "/opt/homebrew/bin/ffmpeg"
FFPROBE = "/opt/homebrew/bin/ffprobe"
NAMES = [f"{name}-1080p.mp4" for name in ("prologue", "granny", "chef", "dock", "ending")]
TARGET_BYTES = 15_000_000
ENCODING = {"codec": "libx264", "preset": "slow", "crf": 22,
            "maxrate": "3500k", "bufsize": "7000k", "gop": 48,
            "threads": 4, "parallel_processes": 2, "faststart": True}


def sha256(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as file:
        for block in iter(lambda: file.read(8 * 1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def run(command: list[str], log: Path | None = None) -> subprocess.CompletedProcess:
    completed = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if log:
        log.write_text(completed.stderr, encoding="utf-8")
    if completed.returncode:
        raise RuntimeError(f"Command failed ({completed.returncode}): {command}\n{completed.stderr[-4000:]}")
    return completed


def probe(path: Path, count: bool = False) -> dict:
    command = [FFPROBE, "-v", "error"]
    if count:
        command += ["-count_frames"]
    command += ["-show_streams", "-show_format", "-of", "json", str(path)]
    return json.loads(run(command).stdout)


def timing(path: Path) -> list[tuple[str, str]]:
    data = json.loads(run([FFPROBE, "-v", "error", "-select_streams", "v:0",
                           "-show_frames", "-show_entries",
                           "frame=best_effort_timestamp_time,duration_time,pkt_duration_time",
                           "-of", "json", str(path)]).stdout)
    return [(f["best_effort_timestamp_time"], f.get("duration_time", f.get("pkt_duration_time", "")))
            for f in data["frames"]]


def mp4_atoms(path: Path) -> list[dict]:
    atoms = []
    with path.open("rb") as file:
        end = path.stat().st_size
        while file.tell() + 8 <= end:
            offset = file.tell()
            size, atom = struct.unpack(">I4s", file.read(8))
            if size == 1:
                size = struct.unpack(">Q", file.read(8))[0]
            elif size == 0:
                size = end - offset
            if size < 8 or offset + size > end:
                raise ValueError(f"Invalid MP4 atom at {offset}: {path}")
            atoms.append({"name": atom.decode("ascii", errors="replace"), "offset": offset, "bytes": size})
            file.seek(offset + size)
    return atoms


def thumbnails(source: Path, output: Path, duration: float, stem: str) -> str:
    from PIL import Image, ImageDraw
    sheet = Image.new("RGB", (1280, 3 * 390), "#152123")
    draw = ImageDraw.Draw(sheet)
    for row, fraction in enumerate((0.12, 0.5, 0.86)):
        timestamp = duration * fraction
        for col, (kind, path) in enumerate((("source", source), ("optimized", output))):
            frame = WORK / f"{stem}-{kind}-{row}.jpg"
            run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-threads", "2",
                 "-ss", f"{timestamp:.6f}", "-i", str(path), "-frames:v", "1",
                 "-vf", "scale=640:360", "-filter_threads", "2", "-threads", "2",
                 "-q:v", "2", str(frame)])
            with Image.open(frame) as image:
                sheet.paste(image, (640 * col, 390 * row + 30))
            draw.text((640 * col + 14, 390 * row + 9),
                      f"{stem} | {kind} | {timestamp:.3f}s", fill="#f7e9cc")
    target = WORK / f"{stem}-comparison.jpg"
    sheet.save(target, quality=94)
    return str(target.relative_to(ROOT))


def optimize(name: str) -> dict:
    started = time.monotonic()
    source, destination = SOURCE / name, RELEASE / name
    if not source.is_file() or not destination.is_file():
        raise FileNotFoundError(name)
    source_hash = sha256(source)
    source_data = probe(source)
    video = [stream for stream in source_data["streams"] if stream["codec_type"] == "video"]
    assert len(source_data["streams"]) == len(video) == 1, "Expected one silent video stream"
    source_video = video[0]
    assert (source_video["width"], source_video["height"]) == (1920, 1080)
    assert Fraction(source_video["avg_frame_rate"]) == 24
    timescale = Fraction(source_video["time_base"]).denominator
    output = WORK / name.replace(".mp4", ".optimized.mp4")
    stem = source.stem
    command = [FFMPEG, "-hide_banner", "-y", "-threads", "2", "-i", str(source),
               "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "0",
               "-c:v", "libx264", "-preset", "slow", "-crf", "22",
               "-maxrate", "3500k", "-bufsize", "7000k", "-g", "48",
               "-keyint_min", "24", "-pix_fmt", "yuv420p", "-threads", "4",
               "-fps_mode", "passthrough", "-video_track_timescale", str(timescale),
               "-movflags", "+faststart", str(output)]
    run(command, WORK / f"{stem}-encode.log")
    output_data = probe(output, count=True)
    output_video = output_data["streams"][0]
    if output.stat().st_size >= TARGET_BYTES:
        raise ValueError(f"Target size exceeded: {output.stat().st_size} for {name}")
    for key in ("width", "height", "avg_frame_rate", "r_frame_rate", "time_base", "duration_ts", "nb_frames"):
        if source_video[key] != output_video[key]:
            raise ValueError(f"Changed {key} in {name}: {source_video[key]} != {output_video[key]}")
    source_timing, output_timing = timing(source), timing(output)
    if source_timing != output_timing:
        raise ValueError(f"Per-frame presentation timing differs: {name}")
    if len(source_timing) != int(output_video["nb_read_frames"]):
        raise ValueError(f"Decoded frame count differs: {name}")
    decode = run([FFMPEG, "-hide_banner", "-v", "error", "-xerror", "-threads", "2",
                  "-i", str(output), "-map", "0:v:0", "-f", "null", "-"],
                 WORK / f"{stem}-decode.log")
    ssim = run([FFMPEG, "-hide_banner", "-threads", "2", "-i", str(source),
                "-threads", "2", "-i", str(output), "-filter_complex_threads", "2",
                "-lavfi", "[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]ssim",
                "-an", "-f", "null", "-"], WORK / f"{stem}-ssim.log")
    match = re.findall(r"SSIM Y:([\d.]+).*?U:([\d.]+).*?V:([\d.]+).*?All:([\d.]+)", ssim.stderr)
    if not match:
        raise RuntimeError(f"Missing SSIM result: {name}")
    score = dict(zip(("Y", "U", "V", "All"), map(float, match[-1])))
    if score["All"] < 0.96:
        raise ValueError(f"Full-frame SSIM below 0.96: {name}: {score}")
    atoms = mp4_atoms(output)
    positions = {atom["name"]: atom["offset"] for atom in atoms}
    if positions["moov"] >= positions["mdat"]:
        raise ValueError(f"Faststart missing: {name}")
    comparison = thumbnails(source, output, float(source_video["duration"]), stem)
    if sha256(source) != source_hash:
        raise ValueError(f"Source unexpectedly changed: {source}")
    result = {
        "name": name, "source": str(source.relative_to(ROOT)),
        "release": str(destination.relative_to(ROOT)), "source_sha256": source_hash,
        "release_sha256": sha256(output), "source_bytes": source.stat().st_size,
        "release_bytes": output.stat().st_size,
        "saved_bytes": source.stat().st_size - output.stat().st_size,
        "saved_percent": round((1 - output.stat().st_size / source.stat().st_size) * 100, 2),
        "width": 1920, "height": 1080, "fps": "24/1", "frames": len(source_timing),
        "duration_seconds": float(source_video["duration"]),
        "frame_timestamps_and_durations_identical": True,
        "full_decode_passed": not decode.stderr.strip(), "audio_streams": 0,
        "ssim_full_video": score, "faststart": True, "mp4_top_level_atoms": atoms,
        "comparison_sheet": comparison, "visual_review": "pending",
        "elapsed_seconds": round(time.monotonic() - started, 2),
        "ffmpeg_command": command,
    }
    output.replace(destination)
    print(json.dumps({"file": name, "bytes": result["release_bytes"], "ssim": score["All"],
                      "saved_percent": result["saved_percent"]}), flush=True)
    return result


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(optimize, NAMES))
    original = sum(item["source_bytes"] for item in results)
    optimized = sum(item["release_bytes"] for item in results)
    report = {"version": 1, "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
              "scope": "Only five silent CG MP4 release copies; public originals and competition films unchanged",
              "encoding": ENCODING, "target_bytes_per_file": TARGET_BYTES,
              "files": results, "source_total_bytes": original, "release_total_bytes": optimized,
              "saved_bytes": original - optimized,
              "saved_percent": round((1 - optimized / original) * 100, 2),
              "all_technical_checks_passed": True, "visual_review": "pending"}
    target = AUDIT / "video-optimization.json"
    target.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Report: {target}", flush=True)


if __name__ == "__main__":
    main()
