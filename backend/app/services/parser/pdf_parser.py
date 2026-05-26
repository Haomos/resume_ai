"""PDF text extraction using PyMuPDF (fitz)."""

import base64
import io
import re

import fitz  # PyMuPDF


def _is_garbage_text(text: str) -> bool:
    """Heuristic: detect if PyMuPDF returned mojibake."""
    if not text:
        return True
    bad = sum(1 for ch in text if ch == "�" or (0x00 <= ord(ch) <= 0x08) or (0x0b <= ord(ch) <= 0x0c) or (0x0e <= ord(ch) <= 0x1f))
    return bad > len(text) * 0.05


def _html_entities_to_text(html: str) -> str:
    """Convert &#xHHHH; and &#DDD; entities back to Unicode characters."""
    def repl(m):
        if m.group(1):
            return chr(int(m.group(1), 16))
        return chr(int(m.group(2)))
    return re.sub(r"&#x([0-9a-fA-F]+);|&#(\d+);", repl, html)


def extract_text(content: bytes) -> str | None:
    """Extract text from PDF bytes. Returns None on failure or empty result."""
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        parts = []
        for page in doc:
            text = page.get_text()
            if text.strip():
                parts.append(text.strip())
        doc.close()
        result = "\n\n".join(parts) if parts else ""
        if result and not _is_garbage_text(result):
            return result or None
    except Exception:
        pass

    # Fallback: extract from HTML mode then strip tags
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        parts = []
        for page in doc:
            html = page.get_text("html")
            if html.strip():
                text_only = re.sub(r"<[^>]*>", "", html)
                text_only = _html_entities_to_text(text_only)
                if text_only.strip():
                    parts.append(text_only.strip())
        doc.close()
        result = "\n\n".join(parts) if parts else ""
        return result or None
    except Exception:
        return None


def _compress_image_to_jpeg(image_bytes: bytes, max_width: int = 300, quality: int = 85) -> bytes | None:
    """Resize and compress image bytes to JPEG bytes."""
    try:
        from PIL import Image as PILImage
        img = PILImage.open(io.BytesIO(image_bytes))
        # Convert palette/CMYK to RGB
        if img.mode in ("P", "RGBA", "L", "LA"):
            img = img.convert("RGB")
        elif img.mode == "CMYK":
            img = img.convert("RGB")
        # Resize if too wide
        if img.width > max_width:
            ratio = max_width / img.width
            new_h = int(img.height * ratio)
            img = img.resize((max_width, new_h), PILImage.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        return buf.getvalue()
    except Exception:
        return None


def _extract_images_as_base64(doc: fitz.Document, max_pages: int = 2) -> list[str]:
    """Extract resume photos from the first ``max_pages`` pages.

    Returns a list of ``<img class="resume-photo" ...>`` tags with base64 data URLs.

    Filtering rules (white-list style — relaxed in 2026-05-08 PDF→xhtml refactor):
    - Skip very small bytes (<800B): pure decorative pixels / 1x1 spacers
    - Skip extreme aspect ratios (>4 or <0.15): banners / vertical rules
    - Scan first ``max_pages`` pages (avatars sometimes live on page 2 in DOCX→PDF)
    """
    tags: list[str] = []
    try:
        for page_idx, page in enumerate(doc):
            if page_idx >= max_pages:
                break
            image_list = page.get_images(full=True)
            for img in image_list:
                xref = img[0]
                try:
                    base_image = doc.extract_image(xref)
                    if not base_image:
                        continue
                    image_bytes = base_image["image"]
                    ext = base_image["ext"]
                    if len(image_bytes) < 800:  # was 2048 — too aggressive, dropped real avatars
                        continue
                    pix = fitz.Pixmap(doc, xref)
                    width, height = pix.width, pix.height
                    pix = None
                    aspect = width / height if height > 0 else 1
                    if aspect > 4 or aspect < 0.15:
                        continue
                    if len(image_bytes) > 80_000:
                        compressed = _compress_image_to_jpeg(image_bytes)
                        if compressed and len(compressed) < len(image_bytes):
                            image_bytes = compressed
                            ext = "jpeg"
                    b64 = base64.b64encode(image_bytes).decode("utf-8")
                    tags.append(
                        f'<img class="resume-photo" src="data:image/{ext};base64,{b64}" '
                        f'style="max-width:120px;max-height:160px;float:right;'
                        f'margin:0 0 12px 16px;border-radius:4px;object-fit:cover;" />'
                    )
                except Exception:
                    # Suppress per-image extraction failures; outer caller still gets remaining tags.
                    continue
    except Exception:
        pass
    return tags


# --- Structured HTML extraction (dict-mode + visual reading order) -----------


def _classify_blocks_by_size(blocks: list[tuple]) -> dict[float, str]:
    """Map each distinct font size to an HTML tag.

    Algorithm:
    - body_size = the most common font size across all blocks
    - any size > body_size * 1.1 is a heading candidate
    - top-1 heading size → <h2>, top-2 → <h3>, others → <p>

    We deliberately use ``<h2>`` not ``<h1>`` for the largest because resume
    templates typically reserve ``<h1>`` for the page title (user can promote
    later); auto-promoting the candidate's name to h1 would visually clash
    with our export template's h1 styling.
    """
    if not blocks:
        return {}
    size_counts: dict[float, int] = {}
    for _, _, _, size, _ in blocks:
        size_counts[size] = size_counts.get(size, 0) + 1
    body_size = max(size_counts, key=size_counts.get)
    heading_candidates = sorted(
        {s for s in size_counts if s > body_size * 1.1},
        reverse=True,
    )
    mapping: dict[float, str] = {}
    if len(heading_candidates) >= 1:
        mapping[heading_candidates[0]] = "h2"
    if len(heading_candidates) >= 2:
        mapping[heading_candidates[1]] = "h3"
    return mapping


def extract_structured_html(content: bytes) -> str | None:
    """Extract structured HTML from PDF, in **visual reading order**.

    Implementation note (2026-05-08 v2 refactor — "PyMuPDF dict mode"):

    The earlier xhtml-based version (v1) fixed paragraph fragmentation but
    inherited PyMuPDF's PDF-stream-order output, which placed sidebar content
    (name / contact info / section labels — usually drawn last in the PDF
    stream) at the **bottom** of the editor for typical 2-column / Word-export
    resumes.

    v2 switches to ``page.get_text("dict")`` which exposes ``bbox`` + ``font
    size`` per block. We:

    1. Iterate text blocks across all pages
    2. Compute the body font-size (mode of all sizes)
    3. Map heading-candidate sizes (>1.1× body) to ``<h2>`` / ``<h3>``
    4. **Sort all blocks by ``(page_idx, round(y0), x0)``** — this is the
       fix; it brings the sidebar back to the top where the user expects it
    5. Render each block's text under the size-derived tag, joining intra-block
       lines with ``<br/>`` (PyMuPDF's ``"line"`` granularity already mirrors
       the PDF's visual line breaks)

    Avatar extraction stays in ``_extract_images_as_base64`` (which iterates
    the same dict-mode image blocks via ``page.get_images``).

    Falls back to a paragraph-wrapped plain-text dump on any PyMuPDF failure.
    """
    try:
        doc = fitz.open(stream=content, filetype="pdf")
        image_tags = _extract_images_as_base64(doc)

        # Collect all text blocks across pages with bbox + max font size.
        # tuple shape: (page_idx, y0, x0, max_size, text)
        all_blocks: list[tuple[int, float, float, float, str]] = []
        for page_idx, page in enumerate(doc):
            page_dict = page.get_text("dict")
            for block in page_dict.get("blocks", []):
                if block.get("type", 1) != 0:  # 0 = text, 1 = image
                    continue
                bbox = block.get("bbox") or (0, 0, 0, 0)
                y0, x0 = bbox[1], bbox[0]
                line_texts: list[str] = []
                max_size = 0.0
                for line in block.get("lines", []):
                    line_text = "".join(span.get("text", "") for span in line.get("spans", []))
                    if line_text:
                        line_texts.append(line_text)
                    for span in line.get("spans", []):
                        size = float(span.get("size", 0) or 0)
                        if size > max_size:
                            max_size = size
                text = "\n".join(line_texts).strip()
                if text:
                    all_blocks.append((page_idx, y0, x0, max_size, text))

        # Determine heading classes from font-size distribution.
        size_to_tag = _classify_blocks_by_size(all_blocks)

        # CRITICAL: sort by visual reading order (page → y → x).
        # round(y0) coalesces blocks on the "same line" into x-order.
        all_blocks.sort(key=lambda b: (b[0], round(b[1]), b[2]))

        body_parts: list[str] = []
        for _, _, _, size, text in all_blocks:
            tag = size_to_tag.get(size, "p")
            escaped = _escape_html(text).replace("\n", "<br/>")
            body_parts.append(f"<{tag}>{escaped}</{tag}>")

        doc.close()

        body = "\n".join(body_parts)
        if image_tags:
            body = '<div class="resume-images">' + "".join(image_tags) + "</div>\n" + body
        return body or None
    except Exception:
        text = extract_text(content)
        return None if text is None else f"<p>{_escape_html(text).replace(chr(10), '</p><p>')}</p>"


def _escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
