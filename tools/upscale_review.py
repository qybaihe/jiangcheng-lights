"""Inspect encoded AI CG masters without changing the gameplay/media manifests."""
from __future__ import annotations
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from upscale_cinema import ROOT, QA, PUBLIC, FFMPEG, sha, write


def review(scene: str) -> None:
    old = json.loads((QA / "source-manifest-snapshot.json").read_text())["scenes"][scene]
    folder = QA / scene
    report = json.loads((folder / "technical.json").read_text())
    movie = ROOT / "public" / report["url"].lstrip("/")
    source = ROOT / report["source"]
    snapshots = folder / "review"
    snapshots.mkdir(exist_ok=True)
    times = [round((s["start"] + s["end"]) / 2, 3) for s in old["shots"]]
    height = len(times) * 445
    board = Image.new("RGB", (1440, height), "#f5efe0")
    draw = ImageDraw.Draw(board)
    records = []
    for row, (time, shot) in enumerate(zip(times, old["shots"])):
        for col, (label, path) in enumerate([("Original 720p", source), ("AI master 1080p", movie)]):
            image = snapshots / f'{shot["shotId"]}-{"source" if col==0 else "ai"}.png'
            subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", str(time), "-i", str(path), "-frames:v", "1", str(image)], check=True)
            im = Image.open(image).convert("RGB")
            if col == 1 and im.size != (1920, 1080):
                raise RuntimeError("Encoded review image is not 1080p")
            draw.text((col*720+12, row*445+10), f'{scene} | {shot["shotId"]} | {time:.3f}s | {label}', fill="black")
            board.paste(im.resize((720, 405), Image.Resampling.LANCZOS), (col*720, row*445+33))
        records.append({"shotId": shot["shotId"], "time": time, "encodedFrameReviewed": str(image.relative_to(ROOT))})
    board.save(snapshots / "shot-comparison.jpg", quality=94)
    # One-second consecutive-frame consistency comparison at original pixel grid.
    # This diagnoses large shifts; it is not evidence of recovered ground truth.
    fps = 24
    start = int((times[len(times)//2]-0.5)*fps)+1
    src_values, ai_values, changes = [], [], []
    for n in range(start, start+24):
        a = Image.open(folder / "frames-source" / f"{n:08d}.png").convert("RGB")
        b = Image.open(folder / "frames-ai-x2" / f"{n:08d}.png").convert("RGB").resize(a.size, Image.Resampling.LANCZOS)
        av, bv = np.asarray(a).astype(np.float32), np.asarray(b).astype(np.float32)
        src_values.append(av); ai_values.append(bv); changes.append((bv-av).mean(axis=(0,1)))
    source_delta = [float(np.abs(a-b).mean()) for a,b in zip(src_values[1:], src_values[:-1])]
    ai_delta = [float(np.abs(a-b).mean()) for a,b in zip(ai_values[1:], ai_values[:-1])]
    temporal = {"start": (start-1)/fps, "frames": 24, "rgbMeanShift255": np.mean(changes,axis=0).tolist(), "sourceConsecutiveDifferenceMean": float(np.mean(source_delta)), "aiConsecutiveDifferenceMean": float(np.mean(ai_delta)), "interpretation": "Descriptive only; frame-wise model, no temporal synthesis. No ground-truth high-resolution reference exists."}
    # Decode every delivered frame to a small RGB signature to catch black frames,
    # frame-order errors, strong tint changes or flashes missed by still sampling.
    signatures = []
    for path in [source, movie]:
        data = subprocess.check_output([FFMPEG, "-v", "error", "-i", str(path), "-vf", "scale=32:18:flags=area", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"])
        signature = np.frombuffer(data, dtype=np.uint8).reshape((-1,18,32,3)).astype(np.float32)
        if len(signature) != report["frameCount"]:
            raise RuntimeError("Full-sequence decoded count mismatch")
        signatures.append(signature)
    delta = signatures[1]-signatures[0]
    color_delta = delta.mean(axis=(1,2))
    flagged = np.flatnonzero(np.abs(color_delta).max(axis=1)>12).tolist()
    full_sequence = {"frames": len(delta), "meanAbsoluteSignatureDifference255": float(np.abs(delta).mean()), "maxFrameMeanRgbShift255": float(np.abs(color_delta).max()), "strongColorShiftFrames": flagged, "method": "All decoded frames compared to matching source at 32x18; gross mismatch diagnostic, not a perceptual-quality score."}
    if flagged:
        raise RuntimeError("Large framewise color mismatch requires review")
    cue_ends = [c["end"] for c in old.get("cues", [])]
    qa = {
        "sourceShaUnchanged": sha(source)==report["sourceSha256"],
        "allShotWindowsRetained": max(s["end"] for s in old["shots"]) <= report["duration"]+.001,
        "allOriginalCueWindowsRetained": not cue_ends or max(cue_ends)<=report["duration"]+.001,
        "durationDeltaSeconds": report["duration"]-old["duration"],
        "frameCount": report["frameCount"], "silentMaster": not report["audio"],
        "stemsReusedUnmodified": old["stems"],
        "visualReview": {"status": "pending_agent_visual_review", "representativeShots": records, "comparison": str((snapshots/"shot-comparison.jpg").relative_to(ROOT))},
        "temporalSample": temporal,
        "fullSequenceSignature": full_sequence,
    }
    if not qa["sourceShaUnchanged"] or not qa["allShotWindowsRetained"] or not qa["allOriginalCueWindowsRetained"] or abs(qa["durationDeltaSeconds"])>.001:
        raise RuntimeError("Source-clock verification failed")
    write(folder / "review.json", qa)
    print(json.dumps({"scene": scene, "comparison": qa["visualReview"]["comparison"], "sourceClock": "passed", "frames": report["frameCount"]}), flush=True)


if __name__ == "__main__":
    parser=argparse.ArgumentParser(); parser.add_argument("scene", choices=["prologue","granny","chef","dock","ending"])
    review(parser.parse_args().scene)
