from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src/assets/brand/mago-bot-wizard-original.png"
OUT = ROOT / "src/assets/brand"

with Image.open(SOURCE) as image:
    source = image.convert("RGBA")
    if source.width != source.height:
        size = min(source.width, source.height)
        left = (source.width - size) // 2
        top = (source.height - size) // 2
        source = source.crop((left, top, left + size, top + size))

    logo = source.resize((512, 512), Image.Resampling.LANCZOS)
    logo.save(OUT / "mago-bot-logo.webp", "WEBP", quality=88, method=6)

    avatar = source.resize((256, 256), Image.Resampling.LANCZOS)
    avatar.save(OUT / "mago-bot-avatar.png", "PNG", optimize=True)

    favicon = source.resize((64, 64), Image.Resampling.LANCZOS)
    favicon.save(OUT / "mago-bot-favicon.png", "PNG", optimize=True)
    favicon.save(OUT / "favicon.ico", "ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

for path in [
    OUT / "mago-bot-logo.webp",
    OUT / "mago-bot-avatar.png",
    OUT / "mago-bot-favicon.png",
    OUT / "favicon.ico",
]:
    print(f"{path.name}: {path.stat().st_size} bytes")
