"""Preserve built-in imagegen originals and encode transparent app assets.

Usage: python scripts/optimize-app-image.py SOURCE KEY control|illustration
Only alpha-preserving resizing and encoding are performed.
"""
import json
import shutil
import sys
from pathlib import Path
from PIL import Image


def optimize(source_name: str, key: str, kind: str) -> None:
    root = Path(__file__).resolve().parent.parent
    if kind not in {"control", "illustration"}:
        raise ValueError("kind must be control or illustration")
    if not key or any(character not in "abcdefghijklmnopqrstuvwxyz0123456789-" for character in key):
        raise ValueError("invalid image key")
    source = Path(source_name).resolve(strict=True)
    original = root / "artifacts" / "app-imagegen-v1" / "originals" / f"{key}.png"
    target = root / "public" / "app-images" / "v1" / f"{key}.webp"
    original.parent.mkdir(parents=True, exist_ok=True)
    target.parent.mkdir(parents=True, exist_ok=True)
    if original.exists() or target.exists():
        raise FileExistsError(key)
    shutil.copy2(source, original)
    with Image.open(original) as loaded:
        picture = loaded.convert("RGBA")
        limit = 144 if kind == "control" else 384
        picture.thumbnail((limit, limit), Image.Resampling.LANCZOS)
        picture.save(target, "WEBP", quality=88, method=6, exact=True)
        alpha = picture.getchannel("A").getextrema()
    print(json.dumps({"key": key, "kind": kind, "alpha": alpha,
                      "width": picture.width, "height": picture.height,
                      "bytes": target.stat().st_size, "runtime": str(target)}))


if __name__ == "__main__":
    optimize(*sys.argv[1:])
