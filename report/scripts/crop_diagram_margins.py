#!/usr/bin/env python3
"""
Trim uniform white margins from diagram PDF/PNG exports.

Used when pdfcrop is unavailable (MiKTeX pdfcrop requires Perl).

Example:
  python report/scripts/crop_diagram_margins.py
  python report/scripts/crop_diagram_margins.py -i img/er_chen.pdf -o img/er_chen
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import fitz
from PIL import Image


def _is_content_pixel(r: int, g: int, b: int, threshold: int) -> bool:
    return r < threshold or g < threshold or b < threshold


def bbox_non_white(pix: fitz.Pixmap, threshold: int) -> tuple[int, int, int, int]:
    """Return (left, top, right, bottom) pixel bbox of non-white content."""
    w, h, n = pix.width, pix.height, pix.n
    if n < 3:
        raise ValueError(f"Expected RGB pixmap, got {n} channels")

    samples = pix.samples
    left, top, right, bottom = w, h, 0, 0
    found = False

    for y in range(h):
        row = y * w * n
        for x in range(w):
            i = row + x * n
            r, g, b = samples[i], samples[i + 1], samples[i + 2]
            if _is_content_pixel(r, g, b, threshold):
                found = True
                left = min(left, x)
                right = max(right, x)
                top = min(top, y)
                bottom = max(bottom, y)

    if not found:
        return 0, 0, w, h
    return left, top, right + 1, bottom + 1


def expand_bbox(
    bbox: tuple[int, int, int, int],
    width: int,
    height: int,
    padding: int,
) -> tuple[int, int, int, int]:
    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(width, right + padding)
    bottom = min(height, bottom + padding)
    return left, top, right, bottom


def render_png_from_pdf(input_pdf: Path, output_png: Path, dpi: int) -> None:
    """High-DPI raster preview; PDF remains the vector source for slides."""
    doc = fitz.open(input_pdf)
    page = doc[0]
    matrix = fitz.Matrix(dpi / 72.0, dpi / 72.0)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    img = pixmap_to_pil(pix)
    img.save(output_png, format="PNG")
    doc.close()


def pixmap_to_pil(pix: fitz.Pixmap) -> Image.Image:
    if pix.alpha:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def crop_pdf(
    input_pdf: Path,
    output_pdf: Path,
    output_png: Path | None,
    dpi: int,
    threshold: int,
    padding_px: int,
) -> tuple[int, int, int, int]:
    doc = fitz.open(input_pdf)
    page = doc[0]
    scale = dpi / 72.0
    matrix = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=matrix, alpha=False)

    bbox = bbox_non_white(pix, threshold)
    bbox = expand_bbox(bbox, pix.width, pix.height, padding_px)
    left, top, right, bottom = bbox

    page_w_pt = page.rect.width
    page_h_pt = page.rect.height
    px_to_pt = page_w_pt / pix.width
    crop_rect = fitz.Rect(
        left * px_to_pt,
        top * px_to_pt,
        right * px_to_pt,
        bottom * px_to_pt,
    )
    # New page sized to content — works in PowerPoint/Edge (MediaBox = real page size).
    out = fitz.open()
    out_page = out.new_page(width=crop_rect.width, height=crop_rect.height)
    out_page.show_pdf_page(out_page.rect, doc, 0, clip=crop_rect)
    doc.close()

    if output_pdf.resolve() == input_pdf.resolve():
        tmp_path = output_pdf.with_name(output_pdf.stem + "._crop_tmp.pdf")
        out.save(tmp_path)
        out.close()
        shutil.copy2(tmp_path, output_pdf)
        tmp_path.unlink(missing_ok=True)
    else:
        out.save(output_pdf)
        out.close()

    if output_png is not None:
        doc = fitz.open(output_pdf)
        page_out = doc[0]
        pix_out = page_out.get_pixmap(matrix=matrix, alpha=False)
        img = pixmap_to_pil(pix_out)
        img.save(output_png, format="PNG", optimize=True)
        doc.close()

    return bbox


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    default_in = root / "img" / "er_chen.pdf"
    default_out = root / "img" / "er_chen"

    parser = argparse.ArgumentParser(description="Crop white margins from diagram PDF.")
    parser.add_argument(
        "-i",
        "--input",
        type=Path,
        default=default_in,
        help=f"Input PDF (default: {default_in})",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=default_out,
        help="Output path without extension (.pdf and .png written)",
    )
    parser.add_argument("--dpi", type=int, default=300, help="PNG render DPI")
    parser.add_argument(
        "--threshold",
        type=int,
        default=248,
        help="Pixels brighter than this on all channels are treated as background",
    )
    parser.add_argument(
        "--padding",
        type=int,
        default=8,
        help="Extra pixels kept around content after crop",
    )
    parser.add_argument("--no-png", action="store_true", help="Only write PDF")
    parser.add_argument(
        "--png-only",
        action="store_true",
        help="Only render PNG from input PDF (leave PDF unchanged, vector-safe)",
    )
    args = parser.parse_args()

    input_pdf = args.input.resolve()
    if not input_pdf.is_file():
        raise SystemExit(f"Input not found: {input_pdf}")

    output_base = args.output.resolve()
    output_pdf = output_base.with_suffix(".pdf")
    output_png = None if args.no_png else output_base.with_suffix(".png")

    output_pdf.parent.mkdir(parents=True, exist_ok=True)

    if args.png_only:
        if output_png is None:
            raise SystemExit("--png-only requires PNG output (do not pass --no-png)")
        render_png_from_pdf(input_pdf, output_png, dpi=args.dpi)
        print(f"Input:  {input_pdf}")
        print(f"Output: {output_png} ({args.dpi} dpi raster)")
        return

    bbox = crop_pdf(
        input_pdf=input_pdf,
        output_pdf=output_pdf,
        output_png=output_png,
        dpi=args.dpi,
        threshold=args.threshold,
        padding_px=args.padding,
    )

    print(f"Input:  {input_pdf}")
    print(f"Crop px bbox (on {args.dpi} dpi render): {bbox}")
    print(f"Output: {output_pdf}")
    if output_png:
        print(f"        {output_png}")


if __name__ == "__main__":
    main()
