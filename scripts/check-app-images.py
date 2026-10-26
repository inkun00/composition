"""Validate generated image provenance, dimensions, alpha, and deployed filenames."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
docs = root / "docs" / "app-imagegen-v1"
prompt_files = ["control-a-prompts.json", "control-b-prompts.json", "illustration-prompts.json"]
records = []
for name in prompt_files:
    content = json.loads((docs / name).read_text(encoding="utf-8-sig"))
    if isinstance(content, dict):
        assert content["generator"] == "Built-in image_gen.imagegen"
        assert content["transparentBackground"] is True
        records.extend({**entry, "tool": "built-in image_gen", "transparent_background": True}
                       for entry in content["assets"])
    else:
        records.extend(content)
keys = [entry["key"] for entry in records]
assert len(keys) == len(set(keys)) == 49, "Expected 49 distinct generated image prompts"
runtime = root / "public" / "app-images" / "v1"
assert {path.stem for path in runtime.glob("*.webp")} == set(keys)
assets = []
for entry in records:
    key = entry["key"]
    assert entry.get("tool", entry.get("mode")) == "built-in image_gen"
    assert entry["transparent_background"] is True
    original = root / "artifacts" / "app-imagegen-v1" / "originals" / f"{key}.png"
    target = runtime / f"{key}.webp"
    assert original.is_file(), f"Missing preserved PNG: {key}"
    with Image.open(original) as source, Image.open(target) as loaded:
        picture = loaded.convert("RGBA")
        assert picture.getchannel("A").getextrema() == (0, 255), key
        corners = [(0, 0), (picture.width - 1, 0), (0, picture.height - 1),
                   (picture.width - 1, picture.height - 1)]
        assert all(picture.getpixel(point)[3] == 0 for point in corners), f"Opaque image corner: {key}"
        limit = 384 if key.endswith("-stage") or key == "opening-studio" else 192
        assert max(picture.size) <= limit and min(picture.size) >= 32, key
        assets.append({"key": key, "size": picture.size, "bytes": target.stat().st_size,
                       "sourceSize": source.size, "alpha": [0, 255]})
report = {"method": "built-in image_gen", "count": len(assets),
          "totalBytes": sum(item["bytes"] for item in assets), "assets": assets}
assert report["totalBytes"] < 2_000_000, "Runtime artwork unexpectedly large"
destination = root / "artifacts" / "app-imagegen-v1" / "assets.json"
destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"count": report["count"], "bytes": report["totalBytes"],
                  "alphaAndCornersValid": True, "report": str(destination)}))
