"""Keep original imagegen output and create alpha-preserving web assets.

Usage: python scripts/optimize-studio-image.py SOURCE KEY control|motion
Only resampling and encoding are performed; generated artwork is not retouched.
"""

import json
import shutil
import sys
from pathlib import Path

from PIL import Image


def optimize(source_name: str, key: str, kind: str) -> None:
    root = Path(__file__).resolve().parent.parent
    if kind not in {"control", "motion"}:
        raise ValueError("kind must be control or motion")
    if not key or any(character not in "abcdefghijklmnopqrstuvwxyz0123456789-" for character in key):
        raise ValueError("invalid image key")
    source = Path(source_name).resolve(strict=True)
    originals = root / "artifacts" / "studio-imagegen-v1" / "originals"
    runtime = root / "public" / "studio-images" / "v1"
    originals.mkdir(parents=True, exist_ok=True)
    runtime.mkdir(parents=True, exist_ok=True)
    original = originals / f"{key}.png"
    target = runtime / f"{key}.webp"
    if original.exists() or target.exists():
        raise FileExistsError(f"Image already exists: {key}")
    shutil.copy2(source, original)
    with Image.open(original) as loaded:
        picture = loaded.convert("RGBA")
        size = 144 if kind == "control" else 256
        picture.thumbnail((size, size), Image.Resampling.LANCZOS)
        picture.save(target, "WEBP", quality=88, method=6, exact=True)
        minimum_alpha, maximum_alpha = picture.getchannel("A").getextrema()
        metadata = {"key": key, "kind": kind, "width": picture.width, "height": picture.height,
                    "alpha": [minimum_alpha, maximum_alpha], "bytes": target.stat().st_size,
                    "original": str(original), "runtime": str(target)}
    print(json.dumps(metadata))


if __name__ == "__main__":
    optimize(*sys.argv[1:])
