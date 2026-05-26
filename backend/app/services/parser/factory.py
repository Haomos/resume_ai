"""Resume parser factory — dispatches to format-specific extractors."""

from pathlib import Path
from typing import Optional


def extract_text(content: bytes, filename: str) -> Optional[str]:
    """Extract plain text from resume file content based on extension.

    Supported: pdf, docx, html/htm, txt/text/md, png/jpg/jpeg/webp/bmp (OCR).
    """
    ext = Path(filename).suffix.lstrip(".").lower()

    if ext == "pdf":
        from .pdf_parser import extract_text as _extract
        return _extract(content)

    if ext == "docx":
        from .docx_parser import extract_text as _extract
        return _extract(content)

    if ext in ("html", "htm"):
        from .html_parser import extract_text as _extract
        return _extract(content)

    if ext in ("txt", "text", "md"):
        try:
            text = content.decode("utf-8", errors="ignore")
            return text.strip() or None
        except Exception:
            return None

    if ext in ("png", "jpg", "jpeg", "webp", "bmp"):
        from .image_parser import extract_text as _extract
        return _extract(content)

    return None


def extract_structured_html(content: bytes, filename: str) -> Optional[str]:
    """Extract semantic HTML (headings, paragraphs, lists) from resume file.

    Falls back to ``extract_text`` wrapped in ``<p>`` tags if no structured
    extractor is available for the format.
    """
    ext = Path(filename).suffix.lstrip(".").lower()

    if ext == "pdf":
        from .pdf_parser import extract_structured_html as _extract
        return _extract(content)

    if ext == "docx":
        from .docx_parser import extract_structured_html as _extract
        return _extract(content)

    if ext in ("html", "htm"):
        from .html_parser import extract_structured_html as _extract
        return _extract(content)

    if ext in ("txt", "text", "md"):
        try:
            text = content.decode("utf-8", errors="ignore").strip()
            if not text:
                return None
            from .pdf_parser import _escape_html  # reuse helper
            paragraphs = "\n".join(
                f"<p>{_escape_html(p)}</p>" for p in text.split("\n\n") if p.strip()
            )
            return f"<div class=\"resume-content\">{paragraphs}</div>"
        except Exception:
            return None

    # Images / unsupported → None (caller should fallback to extract_text)
    return None
