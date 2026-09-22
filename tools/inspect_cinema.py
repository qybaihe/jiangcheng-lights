"""Inspect local Seedance clips without networking or modifying the source files.

Run with the project environment: .venv/bin/python tools/inspect_cinema.py
The JSON distinguishes technical readiness from a still-required human visual review.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import io
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CLIPS = [ROOT / f"public/media/cinema-{name}.mp4" for name in
                 ("c01-v1", "c04-v1", "c09-v2")]


def run(command: list[str], timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run(command, capture_output=True, timeout=timeout, check=False)


def diagnostic(result: subprocess.CompletedProcess) -> str:
    return result.stderr.decode("utf-8", errors="replace").strip()[-4000:]


def positive_float(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number > 0 else None
    except (ValueError, TypeError):
        return None


def fps_value(value):
    try:
        return round(float(Fraction(value)), 6)
    except (ValueError, TypeError, ZeroDivisionError):
        return None


def load_font(size: int):
    for name in ("/System/Library/Fonts/Menlo.ttc",
                 "/System/Library/Fonts/Helvetica.ttc",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if Path(name).is_file():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default(size=size)


def timecode(seconds: float) -> str:
    millis = round(seconds * 1000)
    minutes, millis = divmod(millis, 60000)
    whole, millis = divmod(millis, 1000)
    return f"{minutes:02d}:{whole:02d}.{millis:03d}"


def make_sheet(frames, target: Path, title: str, columns: int, width: int):
    # Uniform cells preserve each frame's aspect ratio without cropping.
    height = round(width * 9 / 16)
    gap, label, header = 16, 34, 74
    rows = math.ceil(len(frames) / columns)
    sheet = Image.new("RGB", (gap + columns * (width + gap),
                             header + rows * (height + label + gap)), "#102622")
    draw = ImageDraw.Draw(sheet)
    draw.text((gap, 12), title, font=load_font(24), fill="#f0e7d5")
    draw.text((gap, 44), "SAMPLED FRAMES / timestamps in source video / visual review required",
              font=load_font(15), fill="#b8c9c1")
    for index, frame in enumerate(frames):
        x = gap + index % columns * (width + gap)
        y = header + index // columns * (height + label + gap)
        with Image.open(frame["path"]) as original:
            thumb = original.convert("RGB")
            thumb.thumbnail((width, height), Image.Resampling.LANCZOS)
            sheet.paste(thumb, (x + (width - thumb.width) // 2,
                               y + (height - thumb.height) // 2))
        draw.text((x, y + height + 6), f"{index + 1:02d}   {timecode(frame['seconds'])}",
                  font=load_font(18), fill="#e8d9b5")
    sheet.save(target, quality=94, subsampling=0)
    return {"path": str(target), "width": sheet.width, "height": sheet.height}


def inspect_clip(path: Path, args) -> dict:
    path = path.resolve()
    record = {"path": str(path), "exists": path.is_file(),
              "technical_status": "missing", "visual_review": "not_performed"}
    if not path.is_file():
        record["error"] = "Source video does not exist; it has not passed inspection."
        return record
    initial_stat = path.stat()
    record.update(bytes=initial_stat.st_size, technical_status="failed")
    if not initial_stat.st_size:
        record["error"] = "Source video is empty."
        return record
    with path.open("rb") as stream:
        record["sha256"] = hashlib.file_digest(stream, "sha256").hexdigest()

    probe = run([args.ffprobe, "-v", "error", "-protocol_whitelist", "file,pipe",
                 "-show_format", "-show_streams", "-of", "json", str(path)])
    if probe.returncode:
        record["error"] = "ffprobe failed"
        record["diagnostic"] = diagnostic(probe)
        return record
    metadata = json.loads(probe.stdout)
    videos = [s for s in metadata.get("streams", []) if s.get("codec_type") == "video"]
    audios = [s for s in metadata.get("streams", []) if s.get("codec_type") == "audio"]
    record["video_streams"] = [{key: stream.get(key) for key in
        ("index", "codec_name", "profile", "width", "height", "pix_fmt", "duration",
         "avg_frame_rate", "r_frame_rate", "nb_frames", "color_space", "color_transfer",
         "color_primaries")} | {"fps": fps_value(stream.get("avg_frame_rate"))}
        for stream in videos]
    record["audio_streams"] = [{key: stream.get(key) for key in
        ("index", "codec_name", "sample_rate", "channels", "channel_layout", "duration")}
        for stream in audios]
    record["has_audio"] = bool(audios)
    if not videos:
        record["error"] = "No video stream found."
        return record
    duration = positive_float(videos[0].get("duration")) or positive_float(
        metadata.get("format", {}).get("duration"))
    record["duration_seconds"] = duration
    if duration is None:
        record["error"] = "No valid positive duration found."
        return record

    decoded = run([args.ffmpeg, "-v", "error", "-xerror", "-err_detect", "explode",
                   "-protocol_whitelist", "file,pipe", "-i", str(path),
                   "-map", "0:v", "-map", "0:a?", "-f", "null", "-"])
    record["full_decode"] = {"passed": decoded.returncode == 0 and not decoded.stderr.strip(),
                             "returncode": decoded.returncode,
                             "diagnostic": diagnostic(decoded)}
    if not record["full_decode"]["passed"]:
        record["error"] = "Full video/audio decoding reported errors."
        return record

    interval = args.c04_interval if "c04" in path.stem.lower() else args.interval
    # Include the final visible frame, in addition to the regularly spaced samples.
    fps = fps_value(videos[0].get("avg_frame_rate")) or 25
    last_time = max(0, duration - max(1 / fps, 0.001))
    times = [round(index * interval, 6) for index in range(math.floor(last_time / interval) + 1)]
    if last_time - times[-1] > 0.001:
        times.append(round(last_time, 6))
    frame_dir = args.output_dir / f"video-{path.stem}-frames"
    frame_dir.mkdir(parents=True, exist_ok=True)
    frames = []
    for index, seconds in enumerate(times):
        extracted = run([args.ffmpeg, "-v", "error", "-xerror", "-protocol_whitelist", "file,pipe",
                         "-ss", f"{seconds:.6f}", "-i", str(path), "-map", "0:v:0",
                         "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], timeout=60)
        if extracted.returncode or not extracted.stdout:
            record.update(error=f"Frame extraction failed at {seconds:.6f}s",
                          diagnostic=diagnostic(extracted), frames=frames)
            return record
        destination = frame_dir / f"{index:03d}-{seconds:06.3f}s.jpg"
        with Image.open(io.BytesIO(extracted.stdout)) as frame:
            frame.convert("RGB").save(destination, quality=96, subsampling=0)
        frames.append({"seconds": seconds, "path": str(destination)})
    record["sampling"] = {"interval_seconds": interval, "includes_last_frame": True,
                          "count": len(frames)}
    record["frames"] = frames
    record["contact_sheet"] = make_sheet(frames, args.output_dir / f"video-{path.stem}.jpg",
                                         f"{path.stem} / {duration:.3f}s / {fps:g} fps",
                                         args.columns, args.thumb_width)
    final_stat = path.stat()
    if (initial_stat.st_size, initial_stat.st_mtime_ns) != (final_stat.st_size, final_stat.st_mtime_ns):
        record["error"] = "Source changed during inspection; re-run after download completes."
        return record
    record["technical_status"] = "passed"
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("clips", nargs="*", type=Path, default=DEFAULT_CLIPS)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "output/cinema/qa")
    parser.add_argument("--report", type=Path, help="JSON file; defaults to OUTPUT_DIR/video-inspection.json")
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--c04-interval", type=float, default=0.5)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--thumb-width", type=int, default=480)
    args = parser.parse_args()
    if min(args.interval, args.c04_interval) <= 0 or not all(
            math.isfinite(x) for x in (args.interval, args.c04_interval)):
        parser.error("sampling intervals must be finite and greater than zero")
    if args.columns < 1 or args.thumb_width < 160:
        parser.error("columns must be positive and thumb width at least 160")
    args.output_dir = args.output_dir.resolve()
    args.ffmpeg, args.ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    report = {"inspected_at": datetime.now(timezone.utc).isoformat(), "offline": True,
              "visual_review": "not_performed", "clips": []}
    if not args.ffmpeg or not args.ffprobe:
        report.update(technical_status="failed", error="ffmpeg and ffprobe must both be installed")
    else:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        for clip in args.clips:
            try:
                report["clips"].append(inspect_clip(clip, args))
            except (OSError, ValueError, subprocess.TimeoutExpired) as error:
                report["clips"].append({"path": str(clip.resolve()), "technical_status": "failed",
                                         "visual_review": "not_performed", "error": str(error)})
        report["technical_status"] = "passed" if report["clips"] and all(
            clip["technical_status"] == "passed" for clip in report["clips"]) else "failed"
    serialized = json.dumps(report, ensure_ascii=False, indent=2)
    report_path = args.report or args.output_dir / "video-inspection.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)
    return 0 if report["technical_status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
