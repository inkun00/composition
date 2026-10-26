"""Rebuild web artwork from preserved PNGs at measured UI display sizes.

Run without arguments to inspect candidates, then --apply to save smaller files.
The original children illustrations and notation pixels are never changed.
"""
import argparse
from hashlib import sha256
from io import BytesIO
import json
import math
from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "artifacts" / "image-optimization-v1"
PROFILES = {
    "app": {"directory": "app-images", "originals": "app-imagegen-v1", "count": 49},
    "studio": {"directory": "studio-images", "originals": "studio-imagegen-v1", "count": 57},
}
QUALITY = 88


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def dimensions(group: str, key: str) -> int:
    if group == "studio":
        return 256 if key.startswith("motion-") else 144
    return 384 if key.endswith("-stage") or key == "opening-studio" else 144


def composite(picture: Image.Image, color: str) -> Image.Image:
    base = Image.new("RGBA", picture.size, color)
    return Image.alpha_composite(base, picture).convert("RGB")


def psnr(source: Image.Image, decoded: Image.Image, background: str) -> float:
    difference = ImageChops.difference(composite(source, background), composite(decoded, background))
    error = sum(value * value for value in ImageStat.Stat(difference).rms) / 3
    return round(10 * math.log10(255 * 255 / error), 2) if error else 100.0


def inventory() -> dict:
    groups = {}
    for name in ("app-images", "studio-images", "illustrations", "notation"):
        files = [file for file in (ROOT / "public" / name).rglob("*") if file.is_file()]
        groups[name] = {"count": len(files), "bytes": sum(file.stat().st_size for file in files)}
    return groups


def optimize(group: str, profile: dict, apply: bool) -> list[dict]:
    runtime = ROOT / "public" / profile["directory"] / "v1"
    originals = ROOT / "artifacts" / profile["originals"] / "originals"
    targets = sorted(runtime.glob("*.webp"))
    assert len(targets) == profile["count"], f"Unexpected {group} image count"
    records = []
    for target in targets:
        relative = target.relative_to(ROOT)
        original = originals / f"{target.stem}.png"
        assert original.is_file(), f"Missing preserved original: {original}"
        before = target.read_bytes()
        with Image.open(target) as existing:
            previous_size = existing.size
        with Image.open(original) as loaded:
            picture = loaded.convert("RGBA")
        limit = dimensions(group, target.stem)
        picture.thumbnail((limit, limit), Image.Resampling.LANCZOS)
        for quality in (QUALITY, 92, 96):
            encoded = BytesIO()
            picture.save(encoded, "WEBP", quality=quality, method=6, exact=True)
            candidate = encoded.getvalue()
            with Image.open(BytesIO(candidate)) as loaded:
                decoded = loaded.convert("RGBA")
            scores = [psnr(picture, decoded, color) for color in ("#ffffff", "#20232b")]
            if min(scores) >= 35:
                break
        else:
            encoded = BytesIO()
            picture.save(encoded, "WEBP", lossless=True, method=6, exact=True)
            candidate = encoded.getvalue()
            with Image.open(BytesIO(candidate)) as loaded:
                decoded = loaded.convert("RGBA")
            scores = [psnr(picture, decoded, color) for color in ("#ffffff", "#20232b")]
            quality = "lossless"
        assert ImageChops.difference(picture.getchannel("A"), decoded.getchannel("A")).getbbox() is None
        assert min(scores) >= 35, f"Encoding quality unexpectedly low: {target.stem} {scores}"
        selected = candidate if len(candidate) < len(before) else before
        candidate_path = OUTPUT / "candidates" / relative
        candidate_path.parent.mkdir(parents=True, exist_ok=True)
        candidate_path.write_bytes(selected)
        changed = selected != before
        if apply and changed:
            backup = OUTPUT / "before" / relative
            backup.parent.mkdir(parents=True, exist_ok=True)
            if backup.exists():
                assert backup.read_bytes() == before, f"Existing backup differs: {relative}"
            else:
                shutil.copy2(target, backup)
            target.write_bytes(selected)
        records.append({
            "path": relative.as_posix(), "source": original.relative_to(ROOT).as_posix(),
            "sourceSha256": digest(original.read_bytes()), "beforeBytes": len(before),
            "afterBytes": len(selected), "savedBytes": len(before) - len(selected),
            "beforeSize": previous_size, "afterSize": decoded.size if changed else previous_size,
            "beforeSha256": digest(before), "afterSha256": digest(selected),
            "alphaPreserved": True, "encodingQuality": quality,
            "encodingPsnrWhiteDark": scores, "changed": changed,
        })
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    options = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    report_path = OUTPUT / "report.json"
    if options.apply and report_path.exists():
        existing = json.loads(report_path.read_text(encoding="utf-8"))
        if existing.get("applied"):
            assert all(digest((ROOT / row["path"]).read_bytes()) == row["afterSha256"]
                       for row in existing["images"]), "Applied assets have changed; inspect before rerunning"
            print(json.dumps({"alreadyApplied": True, "report": str(report_path)}))
            return
        for name, value in existing["unchangedIllustrations"].items():
            assert digest((ROOT / name).read_bytes()) == value, name
        for row in existing["images"]:
            target = ROOT / row["path"]
            candidate = OUTPUT / "candidates" / row["path"]
            assert digest(target.read_bytes()) == row["beforeSha256"], row["path"]
            assert digest(candidate.read_bytes()) == row["afterSha256"], row["path"]
            assert digest((ROOT / row["source"]).read_bytes()) == row["sourceSha256"], row["source"]
        for row in existing["images"]:
            if not row["changed"]:
                continue
            target = ROOT / row["path"]
            backup = OUTPUT / "before" / row["path"]
            backup.parent.mkdir(parents=True, exist_ok=True)
            if backup.exists():
                assert digest(backup.read_bytes()) == row["beforeSha256"], row["path"]
            else:
                shutil.copy2(target, backup)
            shutil.copy2(OUTPUT / "candidates" / row["path"], target)
        existing.update(applied=True, after=inventory())
        report_path.write_text(json.dumps(existing, indent=2), encoding="utf-8")
        print(json.dumps({key: existing[key] for key in ("applied", "changed", "beforeBytes", "afterBytes", "savedBytes")}))
        return
    preserved = {path.relative_to(ROOT).as_posix(): digest(path.read_bytes())
                 for path in (ROOT / "public" / "illustrations").rglob("*.webp")}
    before = inventory()
    records = [record for group, profile in PROFILES.items() for record in optimize(group, profile, options.apply)]
    assert all(digest((ROOT / name).read_bytes()) == value for name, value in preserved.items())
    report = {
        "applied": options.apply, "quality": QUALITY, "method": "PNG original to resized WebP; lossless alpha",
        "before": before, "after": inventory() if options.apply else None,
        "changed": sum(row["changed"] for row in records),
        "beforeBytes": sum(row["beforeBytes"] for row in records),
        "afterBytes": sum(row["afterBytes"] for row in records),
        "savedBytes": sum(row["savedBytes"] for row in records),
        "unchangedIllustrations": preserved, "images": records,
    }
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("applied", "changed", "beforeBytes", "afterBytes", "savedBytes")}))


if __name__ == "__main__":
    main()
