"""HTML text extraction using BeautifulSoup."""

from bs4 import BeautifulSoup


def extract_text(content: bytes) -> str | None:
    """Extract readable text from HTML bytes. Returns None on failure or empty result."""
    try:
        html = content.decode("utf-8", errors="ignore")
        soup = BeautifulSoup(html, "lxml")
        # Remove script/style/nav/footer tags
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        text = soup.get_text(separator="\n")
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return "\n".join(lines) if lines else None
    except Exception:
        return None


def extract_structured_html(content: bytes) -> str | None:
    """Clean and return semantic HTML from an HTML resume file."""
    try:
        html = content.decode("utf-8", errors="ignore")
        soup = BeautifulSoup(html, "lxml")
        # Remove harmful tags but keep structural tags
        for tag in soup(["script", "style", "nav", "footer", "header", "iframe", "embed"]):
            tag.decompose()
        # If body exists, use it; otherwise use the whole doc
        body = soup.find("body")
        if body:
            return f'<div class="resume-content">{body.decode_contents()}</div>'
        return f'<div class="resume-content">{soup.decode_contents()}</div>'
    except Exception:
        return None
