"""Encode the owner-selected X1W vector; pip install CairoSVG==2.9.1 Pillow==12.3.0.

Run from any directory. --check verifies the committed master/output bindings
without rendering dependencies. Never modifies historical branding evidence.
"""
import hashlib
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MASTER = "packages/ui/src/assets/knorvia-mark.svg"
MANIFEST = ROOT / "packages/desktop/build/product-icon-manifest.json"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


if "--check" in sys.argv:
    manifest = json.loads(MANIFEST.read_text())
    assert manifest["master"] == MASTER
    assert digest(ROOT / MASTER) == manifest["masterSha256"], "Master changed; regenerate icons"
    for name, sha in manifest["outputs"].items():
        assert digest(ROOT / name) == sha, f"Icon drift: {name}"
    print(f"Verified master and {len(manifest['outputs'])} generated product assets")
    sys.exit(0)

import cairosvg
from PIL import Image

outputs = {}


def save(image, name, **options):
    path = ROOT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, **options)
    outputs[name] = digest(path)


source = Image.open(io.BytesIO(cairosvg.svg2png(
    url=str(ROOT / MASTER), output_width=2048, output_height=2048))).convert("RGBA")


def raster(size):
    return source.resize((size, size), Image.Resampling.LANCZOS)


def save_windows_ico(image, name, sizes):
    """Write an ICO whose small frames are 32-bit BMP and only 256px is PNG.

    Windows Shell (taskbar, Alt+Tab, Start menu) extracts the 16-48px frames through
    APIs that expect DIB bitmaps; PNG-compressed small frames are not decoded there and
    the taskbar falls back to the generic application icon. PNG is only safe at 256px.
    """
    import struct
    frames = []
    for size in sizes:
        frame = image.resize((size, size), Image.Resampling.LANCZOS).convert("RGBA")
        if size >= 256:
            buffer = io.BytesIO()
            frame.save(buffer, format="PNG")
            frames.append((size, buffer.getvalue()))
            continue
        # BITMAPINFOHEADER: height counts XOR + AND masks; pixels are bottom-up BGRA.
        xor = b"".join(
            bytes((b, g, r, a))
            for y in range(size - 1, -1, -1)
            for (r, g, b, a) in (frame.getpixel((x, y)) for x in range(size))
        )
        and_stride = ((size + 31) // 32) * 4
        and_mask = bytes(and_stride * size)
        header = struct.pack("<IiiHHIIiiII", 40, size, size * 2, 1, 32, 0,
                             len(xor) + len(and_mask), 0, 0, 0, 0)
        frames.append((size, header + xor + and_mask))
    directory = struct.pack("<HHH", 0, 1, len(frames))
    offset = 6 + 16 * len(frames)
    entries = b""
    for size, data in frames:
        dimension = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dimension, dimension, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    path = ROOT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(directory + entries + b"".join(data for _, data in frames))
    outputs[name] = digest(path)


sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
for directory in ["packages/desktop/build/icons", "public/logo/icons"]:
    for size in sizes:
        save(raster(size), f"{directory}/{size}x{size}.png")
for name in ["packages/desktop/build/icon.png", "packages/desktop/build/icon_windows.png",
             "packages/desktop/build/icon_installer.png", "public/icon_512@2x.png",
             "packages/ui/src/assets/knorvia-logo.png",
             "packages/desktop/src/renderer/public/knorvia-icon.png",
             "packages/web/public/knorvia-logo.png"]:
    save(raster(1024), name)
for name in ["packages/desktop/build/icon.ico", "packages/desktop/build/icon_installer.ico",
             "public/logo/icons/icon.ico", "packages/web/public/favicon.ico"]:
    save_windows_ico(source, name, [n for n in sizes if n <= 256])
for name in ["packages/desktop/build/icon.icns", "packages/desktop/build/icon_installer.icns",
             "public/logo/icons/icon.icns"]:
    save(raster(1024), name)
svg = ROOT / "packages/desktop/build/icon.svg"
svg.write_bytes((ROOT / MASTER).read_bytes())
outputs[str(svg.relative_to(ROOT))] = digest(svg)
for kind, dimensions, size, position in [
    ("Sidebar", (164, 314), 124, (20, 90)), ("Header", (150, 57), 46, (96, 5))
]:
    panel = Image.new("RGB", dimensions, "white")
    mark = raster(size)
    panel.paste(mark, position, mark)
    save(panel, f"packages/desktop/build/installer-branding-x1w/installer{kind}.bmp")
MANIFEST.write_text(json.dumps({
    "master": MASTER, "masterSha256": digest(ROOT / MASTER),
    "reference": "2511.jpg / libfile_268c58f0311081919c229bcef02347a3; owner-selected X1W",
    "method": "Editable vector reconstruction from visual reference; CairoSVG 2.9.1, Pillow 12.3.0; 2048px supersampling",
    "outputs": outputs,
}, indent=2) + "\n")
print(f"Generated {len(outputs)} product assets from {MASTER}")
