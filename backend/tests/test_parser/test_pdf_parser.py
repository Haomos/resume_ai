"""Regression tests for ``pdf_parser.extract_structured_html`` (xhtml mode).

Backstory: in the 2026-05-08 refactor we replaced a flat-regex over PyMuPDF
``"html"`` mode (which produced 51 scrambled paragraphs and zero headings)
with PyMuPDF's native ``"xhtml"`` mode (which yields 12 paragraphs + 6
auto-detected headings in correct reading order). These tests freeze that
contract so we never regress to the carved-out version.
"""

from pathlib import Path

import pytest

from app.services.parser.pdf_parser import extract_structured_html, extract_text


_FIXTURE_PDF = Path(__file__).resolve().parents[3] / "MEMORY" / "private" / "resumes" / "example_1.pdf"


@pytest.fixture(scope="module")
def example_pdf_bytes() -> bytes:
    if not _FIXTURE_PDF.exists():
        pytest.skip(f"sample PDF not present: {_FIXTURE_PDF}")
    return _FIXTURE_PDF.read_bytes()


def test_extract_text_returns_chinese(example_pdf_bytes: bytes):
    text = extract_text(example_pdf_bytes)
    assert text is not None and len(text) > 100
    # Plain text mode preserves Chinese reading order.
    assert "湖南大学" in text
    assert "咕泡科技" in text


def test_structured_html_uses_semantic_tags(example_pdf_bytes: bytes):
    """PyMuPDF xhtml mode must yield <h*> for section headings (font-size inferred)."""
    html = extract_structured_html(example_pdf_bytes)
    assert html is not None

    p_count = html.count("<p>")
    h_count = sum(html.count(f"<h{i}") for i in (1, 2, 3, 4))

    # Sanity: not too many fragments (the old regex carving produced ~51 <p>)
    assert p_count <= 30, f"too many <p>: {p_count} — possible regression to flat-regex carving"
    # At least a couple of section headings detected via font size
    assert h_count >= 3, f"too few headings: {h_count} — xhtml mode should auto-detect h1/h2/h3"


def test_structured_html_preserves_avatar(example_pdf_bytes: bytes):
    """Avatar must survive the relaxed image filter (was lost when threshold was 2KB)."""
    html = extract_structured_html(example_pdf_bytes)
    assert html is not None
    assert 'class="resume-photo"' in html, "avatar dropped — check _extract_images_as_base64 filter"
    # Exactly one resume-images container at the top
    assert html.count('class="resume-images"') == 1


def test_structured_html_preserves_reading_order(example_pdf_bytes: bytes):
    """Education must appear before work experience (chronological reading order)."""
    html = extract_structured_html(example_pdf_bytes)
    assert html is not None
    edu_pos = html.find("湖南大学")
    work_pos = html.find("咕泡科技")
    assert edu_pos != -1 and work_pos != -1
    # Resume convention: 教育经历 → 工作经历 is the canonical order in the source PDF
    assert edu_pos < work_pos, "reading order broke — xhtml mode normally preserves PDF source order"


def test_structured_html_no_inline_images_from_xhtml(example_pdf_bytes: bytes):
    """xhtml mode embeds large inline <img> tags; we strip them and prefix our filtered avatar."""
    html = extract_structured_html(example_pdf_bytes)
    assert html is not None
    # Exactly one <img> — the curated resume-photo. xhtml mode would otherwise emit many.
    assert html.count("<img") == 1


def test_structured_html_visual_reading_order(example_pdf_bytes: bytes):
    """Header (name + contact + section labels) MUST come before body content.

    Regression: PyMuPDF's ``xhtml`` mode (which we used in v1) preserves PDF
    *stream* order, not visual reading order. For 2-column / Word-export
    resumes the sidebar — which renders at the top visually — is drawn LAST in
    the PDF stream, so the v1 output dumped name + section labels at the
    BOTTOM of the editor. v2 sorts blocks by ``(page, round(y0), x0)`` to fix
    this. example_1.pdf is a known-bad case that covers the regression.
    """
    html = extract_structured_html(example_pdf_bytes)
    assert html is not None

    def pos(needle: str) -> int:
        idx = html.find(needle)
        assert idx != -1, f"missing marker in extracted html: {needle!r}"
        return idx

    # Markers: section HEADERS (not content phrases — "湖南大学" e.g. is also
    # mentioned in 个人简介 as "工科背景（湖南大学）" so its first match isn't
    # in 教育经历). We assert that section h3 tags arrive in the correct order.
    p_name = pos("001")
    p_phone = pos("18274760001")
    p_summary_h = pos("个人简介")
    p_skills_h = pos("技术能力")
    p_edu_h = pos("教育经历")
    p_proj_h = pos("项目经历")
    p_work_h = pos("工作经历")
    p_work_content = pos("咕泡科技")

    assert p_name < p_phone, "name should appear before phone"
    assert p_phone < p_summary_h, "contact should appear before 个人简介 header"
    assert p_summary_h < p_skills_h < p_edu_h < p_proj_h < p_work_h, (
        f"section headers out of order: 个人简介={p_summary_h} 技术能力={p_skills_h} "
        f"教育经历={p_edu_h} 项目经历={p_proj_h} 工作经历={p_work_h}"
    )
    assert p_work_h < p_work_content, "工作经历 header must precede 咕泡科技 content"