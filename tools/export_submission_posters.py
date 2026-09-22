"""Export the five GPT Image 2 posters without adding or replacing typography.

Generation is performed separately by the installed imagegen CLI via tools/media.py.
This script only resizes, embeds sRGB, encodes JPEG, validates and packages files.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageCms, ImageOps


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "output/submission-posters-v1"
UPLOAD = ROOT / "output/江城有灯-参赛海报-1920x1080"
ZIP = ROOT / "output/江城有灯-参赛海报-5张.zip"
SIZE = (1920, 1080)
POSTERS = [
    ("submission-poster-v1-01-arrival", "01-江城有灯-主视觉.jpg", "这一趟，不只是送东西。"),
    ("submission-poster-v1-02-wuhan", "02-武汉街巷-城市探索.jpg", "武汉味，藏在日常里"),
    ("submission-poster-v1-03-gameplay-r2", "03-互动玩法-亲手完成.jpg", "每件小事，都亲手完成"),
    ("submission-poster-v1-04-neighbours", "04-邻里故事-雨前照应.jpg", "雨会来，灯会亮"),
    ("submission-poster-v1-05-endings", "05-四种结局-记忆画廊.jpg", "总有人，替你留一盏灯。"),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    # Validate all inputs before creating the upload package.
    for name, _, _ in POSTERS:
        source = ROOT / "output/imagegen" / f"{name}.png"
        with Image.open(source) as im:
            im.verify()
        with Image.open(source) as im:
            if im.size != (2048, 1152):
                raise ValueError(f"Unexpected master dimensions: {source.name}: {im.size}")

    WORK.mkdir(parents=True, exist_ok=True)
    UPLOAD.mkdir(parents=True, exist_ok=True)
    expected_names = {filename for _, filename, _ in POSTERS}
    extras = {p.name for p in UPLOAD.iterdir()} - expected_names
    if extras:
        raise ValueError(f"Upload folder contains unexpected files: {sorted(extras)}")

    profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    report = []
    previews = []
    prompt_blocks = []
    for name, filename, headline in POSTERS:
        source = ROOT / "output/imagegen" / f"{name}.png"
        destination = UPLOAD / filename
        with Image.open(source) as raw:
            im = ImageOps.exif_transpose(raw).convert("RGB")
            im = im.resize(SIZE, Image.Resampling.LANCZOS)
            im.save(destination, "JPEG", quality=95, subsampling=0, optimize=True,
                    progressive=True, icc_profile=profile)
        with Image.open(destination) as check:
            check.load()
            assert check.format == "JPEG" and check.size == SIZE and check.mode == "RGB"
            assert check.info.get("icc_profile")
            previews.append(check.copy())
        nbytes = destination.stat().st_size
        assert nbytes < 10_000_000, f"Poster exceeds 10 MB: {filename}"
        prompt = ROOT / "media/prompts" / f"{name}.txt"
        prompt_blocks.append(f"## {filename}\n\n```text\n{prompt.read_text().strip()}\n```\n")
        report.append({
            "filename": filename,
            "path": str(destination),
            "headline": headline,
            "width": SIZE[0], "height": SIZE[1], "format": "JPEG",
            "color_mode": "RGB", "color_profile": "sRGB",
            "bytes": nbytes, "megabytes_decimal": round(nbytes / 1_000_000, 3),
            "sha256": sha256(destination),
            "master": str(source), "master_sha256": sha256(source),
            "master_width": 2048, "master_height": 1152,
            "prompt": str(prompt), "prompt_sha256": sha256(prompt),
        })

    total = sum(item["bytes"] for item in report)
    assert len(list(UPLOAD.iterdir())) == 5
    # Even the combined five-image package is kept below 10 MB.
    assert total < 10_000_000, f"Combined posters exceed 10 MB: {total}"

    # Contact sheet is deliberately OUTSIDE the folder containing upload files.
    tile = (924, 520)
    sheet = Image.new("RGB", (1920, 1656), "#eae7da")
    positions = [(24, 24), (972, 24), (24, 568), (972, 568), (498, 1112)]
    for poster, xy in zip(previews, positions):
        sheet.paste(poster.resize(tile, Image.Resampling.LANCZOS), xy)
    contact = WORK / "五张海报总览.jpg"
    sheet.save(contact, "JPEG", quality=94, subsampling=0, optimize=True, icc_profile=profile)

    with zipfile.ZipFile(ZIP, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for _, filename, _ in POSTERS:
            z.write(UPLOAD / filename, arcname=filename)
    with zipfile.ZipFile(ZIP) as z:
        assert set(z.namelist()) == expected_names
        assert len(z.namelist()) == 5 and z.testzip() is None
        for item in report:
            assert hashlib.sha256(z.read(item["filename"])).hexdigest() == item["sha256"]

    # tools/media.py also writes automatic WebP siblings for browser usage.
    # These posters are submission materials, not game-startup assets.
    web_previews = WORK / "生成预览-WebP"
    web_previews.mkdir(exist_ok=True)
    for name, _, _ in POSTERS:
        source = ROOT / "public/media" / f"{name}.webp"
        if source.exists():
            shutil.move(str(source), str(web_previews / source.name))

    payload = {
        "created_at": datetime.now().astimezone().isoformat(),
        "status": "technical_checks_passed",
        "model": "gpt-image-2", "quality": "high",
        "api_mode": "installed imagegen CLI edit with project-reference images via local protocol adapter",
        "typography_origin": "Generated by GPT Image 2 within every source image; no local text overlays",
        "postprocessing": "2048×1152 to 1920×1080 proportional Lanczos downsample; sRGB progressive JPEG quality95 4:4:4",
        "count": 5, "total_bytes": total,
        "total_megabytes_decimal": round(total / 1_000_000, 3),
        "all_individual_files_under_10mb": True,
        "combined_five_files_under_10mb": True,
        "upload_folder": str(UPLOAD), "zip": str(ZIP),
        "zip_bytes": ZIP.stat().st_size, "zip_sha256": sha256(ZIP),
        "contact_sheet": str(contact),
        "visual_review": str(WORK / "copy-qa.md"),
        "images": report,
    }
    (WORK / "verification.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    (WORK / "最终提示词合集.md").write_text(
        "# 江城有灯 · GPT Image 2 海报最终提示词\n\n"
        "模式：已安装 imagegen CLI，经项目本地协议适配器调用 Images edits API；"
        "模型 gpt-image-2，high 质量，原始分辨率 2048×1152。参考图仅用于角色、场景、画风与标识一致性。"
        "全部上图文字由模型直接生成。最终同比例缩小至 1920×1080。\n\n"
        + "\n".join(prompt_blocks)
    )
    lines = [
        "# 江城有灯 · 参赛海报交付", "",
        "5 张横版海报均已导出为 **1920×1080、sRGB JPG**，每张小于 10 MB。",
        f"五张合计 **{total / 1_000_000:.2f} MB**。图片与中文文字均由 **GPT Image 2** 直接生成；本地仅做等比缩放与 JPG 编码。", "",
        f"- [仅含 5 张 JPG 的上传文件夹]({UPLOAD})",
        f"- [5 张打包下载]({ZIP})",
        f"- [总览预览，不作为第六张上传]({contact})", "",
        "## 上传顺序", "",
    ]
    for item in report:
        lines.append(f"- [{item['filename']}]({item['path']}) · {item['megabytes_decimal']:.3f} MB")
    lines.extend([
        "", "## 制作与核验记录", "",
        "海报为游戏主题宣传插画，画面中已标注“游戏主题海报”，不是实机截图。"
        "内容对应已实现的武汉街巷探索、交通工具互动、旧照对景、热食接力、邻里主线与四结局画廊。", "",
        f"- [最终提示词合集]({WORK / '最终提示词合集.md'})",
        f"- [文字与视觉独立核验]({WORK / 'copy-qa.md'})",
        f"- [尺寸、体积、色彩与 SHA-256]({WORK / 'verification.json'})",
        "", "生成原图及制作文件不放入上传文件夹；游戏代码、音频和线上部署未改动。", "",
    ])
    (WORK / "交付说明.md").write_text("\n".join(lines))
    print(json.dumps({key: payload[key] for key in (
        "status", "count", "total_megabytes_decimal", "upload_folder", "zip", "contact_sheet")},
        ensure_ascii=False, indent=2))
    for item in report:
        print(f"{item['filename']}: 1920×1080 JPG {item['megabytes_decimal']:.3f} MB")


if __name__ == "__main__":
    main()
