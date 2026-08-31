#!/usr/bin/env python3
"""Build 400x300 scan masks from the closed contours in character line art."""

from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
CHARACTER_DIR = ROOT / "assets" / "characters"
MASK_DIR = ROOT / "assets" / "masks"
SIZE = (400, 300)


def build_mask(source: Path, destination: Path) -> float:
    grayscale = Image.open(source).convert("L").resize(SIZE, Image.Resampling.LANCZOS)
    # Thicken antialiased ink slightly so tiny generation gaps do not leak during flood fill.
    ink = grayscale.point(lambda value: 255 if value < 215 else 0).filter(ImageFilter.MaxFilter(3))
    pixels = ink.load()
    width, height = SIZE
    outside = bytearray(width * height)
    queue = deque()

    def add(x: int, y: int) -> None:
        index = y * width + x
        if outside[index] or pixels[x, y] != 0:
            return
        outside[index] = 1
        queue.append((x, y))

    for x in range(width):
        add(x, 0)
        add(x, height - 1)
    for y in range(height):
        add(0, y)
        add(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            add(x - 1, y)
        if x + 1 < width:
            add(x + 1, y)
        if y > 0:
            add(x, y - 1)
        if y + 1 < height:
            add(x, y + 1)

    mask = Image.new("L", SIZE, 0)
    output = mask.load()
    covered = 0
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if pixels[x, y] or not outside[index]:
                output[x, y] = 255
                covered += 1

    destination.parent.mkdir(parents=True, exist_ok=True)
    mask.save(destination, optimize=True)
    return covered / (width * height)


def main() -> None:
    MASK_DIR.mkdir(parents=True, exist_ok=True)
    for source in sorted(CHARACTER_DIR.glob("*.png")):
        coverage = build_mask(source, MASK_DIR / source.name)
        if not 0.08 <= coverage <= 0.72:
            raise RuntimeError(f"{source.name}: suspicious mask coverage {coverage:.1%}")
        print(f"{source.stem}: {coverage:.1%}")


if __name__ == "__main__":
    main()
