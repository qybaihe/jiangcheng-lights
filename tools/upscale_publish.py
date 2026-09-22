"""Make lossless HD previews and an integration proposal, not a shared manifest."""
from __future__ import annotations
import argparse
import json
import subprocess
from datetime import datetime, timezone
from upscale_cinema import ROOT, QA, PUBLIC, FFMPEG, probe, sha, write

SCENES = ("prologue", "granny", "chef", "dock", "ending")


def stream_hash(path, selector):
    output = subprocess.check_output([FFMPEG, "-v", "error", "-i", str(path), "-map", selector, "-c", "copy", "-f", "hash", "-hash", "sha256", "-"]).decode().strip()
    return output.split("=", 1)[1]


def preview(scene):
    if scene == "prologue":
        raise RuntimeError("New narrated prologue preview belongs to the audio integration task")
    folder = QA / scene
    report = json.loads((folder/"technical.json").read_text())
    source = ROOT / "public" / report["url"].lstrip("/")
    audio = ROOT / f"public/media/cinema-v3-{scene}-mixed.mp4"
    final = PUBLIC / f"{scene}-1080p-mixed.mp4"
    temp = folder / "preview.partial.mp4"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(source), "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", str(temp)], check=True)
    info = probe(temp)
    video = next(s for s in info["streams"] if s["codec_type"] == "video")
    if int(video["nb_read_frames"]) != report["frameCount"] or video["avg_frame_rate"] != report["fps"]:
        raise RuntimeError("Preview clock mismatch")
    hashes = {"videoSource": stream_hash(source, "0:v:0"), "videoPreview": stream_hash(temp, "0:v:0"), "audioSource": stream_hash(audio, "0:a:0"), "audioPreview": stream_hash(temp, "0:a:0")}
    if hashes["videoSource"] != hashes["videoPreview"] or hashes["audioSource"] != hashes["audioPreview"]:
        raise RuntimeError("Lossless preview stream copy mismatch")
    decode = subprocess.run([FFMPEG, "-v", "error", "-xerror", "-i", str(temp), "-f", "null", "-"], capture_output=True)
    if decode.returncode or decode.stderr:
        raise RuntimeError("Preview decode failed")
    temp.replace(final)
    data = {"url": "/"+str(final.relative_to(ROOT/"public")), "sha256": sha(final), "bytes": final.stat().st_size, "duration": float(info["format"]["duration"]), "videoFrameCount": report["frameCount"], "fps": report["fps"], "audioSource": "/"+str(audio.relative_to(ROOT/"public")), "streamSha256": hashes, "videoStreamUnchanged": True, "audioStreamUnchanged": True, "fullDecode": True}
    write(folder/"preview.json", data)
    print(json.dumps({"scene":scene,"previewUrl":data["url"],"audioStreamUnchanged":True,"videoStreamUnchanged":True}), flush=True)


def integrate():
    scenes = {}
    for scene in SCENES:
        folder = QA/scene
        report = json.loads((folder/"technical.json").read_text())
        review = json.loads((folder/"review.json").read_text())
        if report["status"] != "accepted" or review["visualReview"]["status"] != "accepted_agent_sample_review":
            raise RuntimeError(scene+" is not yet visually accepted")
        path = ROOT/"public"/report["url"].lstrip("/")
        if sha(path) != report["sha256"]:
            raise RuntimeError("Accepted movie changed")
        entry = {"url":report["url"],"poster":report["poster"],"resolution":report["outputResolution"],"fps":24,"frameCount":report["frameCount"],"duration":report["duration"],"silentSha256":report["sha256"],"bytes":report["bytes"],"sourceUrl":"/media/cinema-v3-"+scene+".mp4","sourceSha256":report["sourceSha256"],"sourceClockUnchanged":True,"qualityReview":"accepted_agent_sample_review"}
        if scene != "prologue":
            p=json.loads((folder/"preview.json").read_text())
            entry.update(previewUrl=p["url"],previewSha256=p["sha256"],previewAudioSha256=p["streamSha256"]["audioPreview"])
        scenes[scene]=entry
    result={"version":"cinema-upscale-v1","createdAt":datetime.now(timezone.utc).isoformat(),"status":"accepted","model":"realesr-animevideov3 x2","runtime":"Real-ESRGAN ncnn Vulkan v0.2.0 / Apple M3 Max","process":"720p -> AI 1440p -> Lanczos downsample 1080p; no frame interpolation/retiming","licenses":["/media/cinema-upscale-v1/LICENSE-ncnn.txt","/media/cinema-upscale-v1/LICENSE-Real-ESRGAN.txt"],"scenes":scenes,"prologuePreview":"Produced separately by the narrated-opening integration task"}
    write(PUBLIC/"integration.json",result)
    write(QA/"integration.json",result)
    print(json.dumps({"status":"accepted","scenes":len(scenes),"path":str(PUBLIC/"integration.json")}),flush=True)


if __name__ == "__main__":
    parser=argparse.ArgumentParser();parser.add_argument("action",choices=["preview","integrate"]);parser.add_argument("scene",choices=SCENES,nargs="?")
    args=parser.parse_args()
    if args.action=="integrate":integrate()
    elif args.scene:preview(args.scene)
    else:parser.error("preview requires a scene")
