"""Reproducible offline AI super-resolution for silent cinema masters.

The actual enhancement is Real-ESRGAN animevideov3 x2 inference, not a resize.
An explicit final Lanczos downsample fits its 1440p output to a 1080p web master.
Originals and source-clock timing stay untouched; this tool never edits manifests.
Uses official ncnn Vulkan arm64 (MIT) and Real-ESRGAN (BSD-3-Clause) releases.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import time
import zipfile
from pathlib import Path

import httpx
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "output/qa/cinema-upscale-v1"
RUNTIME = QA / "runtime"
PUBLIC = ROOT / "public/media/cinema-upscale-v1"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
ENGINE_URL = "https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/releases/download/v0.2.0/realesrgan-ncnn-vulkan-v0.2.0-macos.zip"
ENGINE_SHA = "f1cc31f13398126ddec25a186b9e50c7ab3e4f2bc011d0222331b43ce2037d3b"
MODELS_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-macos.zip"
MODELS_SHA = "e0ad05580abfeb25f8d8fb55aaf7bedf552c375b5b4d9bd3c8d59764d2cc333a"
MODEL = "realesr-animevideov3"


def sha(path: Path) -> str:
    with path.open("rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    tmp.replace(path)


def bootstrap() -> Path:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    for url, expected in [(ENGINE_URL, ENGINE_SHA), (MODELS_URL, MODELS_SHA)]:
        archive = RUNTIME / url.rsplit("/", 1)[-1]
        if not archive.exists():
            response = httpx.get(url, follow_redirects=True, timeout=180)
            response.raise_for_status()
            archive.write_bytes(response.content)
        if sha(archive) != expected:
            raise RuntimeError("Official archive fingerprint mismatch")
        with zipfile.ZipFile(archive) as z:
            for member in z.namelist():
                target = (RUNTIME / member).resolve()
                if not target.is_relative_to(RUNTIME.resolve()):
                    raise RuntimeError("Archive path traversal")
            z.extractall(RUNTIME)
    engine = RUNTIME / "realesrgan-ncnn-vulkan-v0.2.0-macos/realesrgan-ncnn-vulkan"
    engine.chmod(0o755)
    return engine


def probe(path: Path) -> dict:
    return json.loads(subprocess.check_output([
        FFPROBE, "-v", "error", "-count_frames", "-show_streams", "-show_format",
        "-of", "json", str(path),
    ]))


def run(scene: str) -> None:
    QA.mkdir(parents=True, exist_ok=True)
    snapshot = QA / "source-manifest-snapshot.json"
    if not snapshot.exists():
        write(snapshot, json.loads((ROOT / "public/media/cinema-v3-manifest.json").read_text()))
    source = ROOT / f"public/media/cinema-v3-{scene}.mp4"
    if not source.exists():
        raise RuntimeError("Silent source master missing")
    original = probe(source)
    video = next(s for s in original["streams"] if s["codec_type"] == "video")
    if any(s["codec_type"] == "audio" for s in original["streams"]):
        raise RuntimeError("Use a silent master: independent stems retain the source clock")
    if (video["width"], video["height"]) != (1280, 720):
        raise RuntimeError("This preset is for reviewed 1280x720 16:9 masters")
    frames = int(video["nb_read_frames"])
    fps = video["avg_frame_rate"]
    folder = QA / scene
    src_dir, ai_dir = folder / "frames-source", folder / "frames-ai-x2"
    for p in [folder, src_dir, ai_dir, PUBLIC]:
        p.mkdir(parents=True, exist_ok=True)
    state = {
        "scene": scene, "source": str(source.relative_to(ROOT)), "sourceSha256": sha(source),
        "model": MODEL, "modelScale": 2, "inferenceResolution": "2560x1440",
        "outputResolution": "1920x1080", "postprocess": "Lanczos downsample 1440p to 1080p; no interpolation or retiming",
        "engine": "Real-ESRGAN ncnn Vulkan v0.2.0, arm64, Apple GPU via MoltenVK",
        "engineUrl": ENGINE_URL, "engineArchiveSha256": ENGINE_SHA,
        "modelsUrl": MODELS_URL, "modelsArchiveSha256": MODELS_SHA,
        "licenses": {
            "runtime": {"license": "MIT", "url": "https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan/blob/master/LICENSE"},
            "upstreamModelProject": {"license": "BSD-3-Clause", "url": "https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE"},
        },
        "frameCount": frames, "fps": fps, "sourceDuration": float(original["format"]["duration"]),
        "sourceUnchanged": True, "audio": False,
    }
    record = folder / "technical.json"
    prior = json.loads(record.read_text()) if record.exists() else {}
    if prior.get("sourceSha256", state["sourceSha256"]) != state["sourceSha256"]:
        raise RuntimeError("Source changed; do not reuse prior frames")
    engine = bootstrap()
    state["modelFiles"] = {
        p.name: sha(p) for p in sorted((RUNTIME / "models").glob("realesr-animevideov3-x2.*"))
    }
    started = time.monotonic()
    write(record, {**state, "status": "extracting"})
    if len(list(src_dir.glob("*.png"))) != frames:
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(source), "-map", "0:v:0", "-vsync", "0", str(src_dir / "%08d.png")], check=True)
    inputs = sorted(src_dir.glob("*.png"))
    if len(inputs) != frames:
        raise RuntimeError("Source extraction count mismatch")
    outputs = sorted(ai_dir.glob("*.png"))
    if len(outputs) != frames:
        # ncnn bulk mode is fast; retain a full command and inference output for audit.
        cmd = [str(engine), "-i", str(src_dir), "-o", str(ai_dir), "-n", MODEL, "-s", "2", "-m", str(RUNTIME / "models"), "-g", "0", "-t", "256", "-j", "1:2:2", "-f", "png"]
        write(record, {**state, "status": "ai_inference", "command": cmd})
        with (folder / "inference.log").open("w") as log:
            subprocess.run(cmd, stdout=log, stderr=subprocess.STDOUT, check=True)
    outputs = sorted(ai_dir.glob("*.png"))
    if [p.name for p in outputs] != [p.name for p in inputs]:
        raise RuntimeError("AI frame sequence mismatch")
    for p in outputs:
        with Image.open(p) as im:
            if im.size != (2560, 1440):
                raise RuntimeError("AI output dimensions mismatch")
    state["aiFramesVerified"] = len(outputs)
    write(record, {**state, "status": "encoding"})
    final = PUBLIC / f"{scene}-1080p.mp4"
    temp = folder / "encoded.partial.mp4"
    encode = [FFMPEG, "-v", "error", "-y", "-framerate", fps, "-i", str(ai_dir / "%08d.png"), "-an", "-vf", "scale=1920:1080:flags=lanczos,setsar=1", "-frames:v", str(frames), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17", "-preset", "slow", "-movflags", "+faststart", str(temp)]
    subprocess.run(encode, check=True)
    checked = probe(temp)
    out = next(s for s in checked["streams"] if s["codec_type"] == "video")
    if int(out["nb_read_frames"]) != frames or out["avg_frame_rate"] != fps or (out["width"], out["height"]) != (1920, 1080):
        raise RuntimeError("Final video dimensions/timing/frame count mismatch")
    duration = float(checked["format"]["duration"])
    if abs(duration - state["sourceDuration"]) > .001:
        raise RuntimeError("Final duration changed")
    decode = subprocess.run([FFMPEG, "-v", "error", "-xerror", "-i", str(temp), "-f", "null", "-"], capture_output=True)
    if decode.returncode or decode.stderr:
        raise RuntimeError("Final full decode failed")
    temp.replace(final)
    poster = final.with_suffix(".jpg")
    subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", "2", "-i", str(final), "-frames:v", "1", "-q:v", "2", str(poster)], check=True)
    if sha(source) != state["sourceSha256"]:
        raise RuntimeError("Original source was modified")
    state.update({"status": "technical_pass_visual_review_pending", "url": "/" + str(final.relative_to(ROOT / "public")), "poster": "/" + str(poster.relative_to(ROOT / "public")), "sha256": sha(final), "bytes": final.stat().st_size, "duration": duration, "fullDecode": True, "elapsedSeconds": round(time.monotonic()-started, 2), "encodeCommand": encode})
    write(record, state)
    print(json.dumps({k: state[k] for k in ("status", "url", "duration", "frameCount", "bytes", "elapsedSeconds")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("scene", choices=["prologue", "granny", "chef", "dock", "ending"])
    args = parser.parse_args()
    run(args.scene)
