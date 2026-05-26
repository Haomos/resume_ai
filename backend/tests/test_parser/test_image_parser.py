"""Tests for image OCR parser.

These tests use mock modules so paddleocr / easyocr need not be installed.
Real OCR integration is exercised manually via a fixture image when desired.
"""

import sys
import types
from io import BytesIO
from unittest.mock import MagicMock

import pytest
from PIL import Image


# ---------- helpers ----------

def _make_png_bytes(size=(100, 30), bg=(255, 255, 255)) -> bytes:
    """Produce a minimal valid PNG byte string for decode tests."""
    buf = BytesIO()
    Image.new("RGB", size, bg).save(buf, format="PNG")
    return buf.getvalue()


# ---------- fixtures ----------

@pytest.fixture(autouse=True)
def _reset_caches():
    """Clear engine + config lru_cache between tests so monkeypatch sticks."""
    from app.config import get_config
    from app.services.parser import image_parser

    get_config.cache_clear()
    image_parser._load_paddle.cache_clear()
    image_parser._load_easy.cache_clear()
    yield
    # post-test cleanup so leaked mocks don't survive into next test
    get_config.cache_clear()
    image_parser._load_paddle.cache_clear()
    image_parser._load_easy.cache_clear()


# ---------- tests ----------

def test_disabled_by_default(monkeypatch):
    """OCR_ENABLED default false → returns None without touching OCR libs."""
    monkeypatch.delenv("OCR_ENABLED", raising=False)
    from app.services.parser.image_parser import extract_text
    assert extract_text(_make_png_bytes()) is None


def test_disabled_explicit_false(monkeypatch):
    """OCR_ENABLED=false explicit → returns None."""
    monkeypatch.setenv("OCR_ENABLED", "false")
    from app.services.parser.image_parser import extract_text
    assert extract_text(_make_png_bytes()) is None


def test_invalid_image_bytes_returns_none(monkeypatch):
    """Garbage bytes when OCR enabled → graceful None (decode failure)."""
    monkeypatch.setenv("OCR_ENABLED", "true")
    from app.services.parser.image_parser import extract_text
    assert extract_text(b"not an image") is None


def test_paddle_engine_missing(monkeypatch):
    """paddleocr not importable → returns None (logged ImportError)."""
    monkeypatch.setenv("OCR_ENABLED", "true")
    monkeypatch.setenv("OCR_ENGINE", "paddle")
    # Make `import paddleocr` raise ImportError
    monkeypatch.setitem(sys.modules, "paddleocr", None)

    from app.services.parser.image_parser import extract_text
    assert extract_text(_make_png_bytes()) is None


def test_easy_engine_missing(monkeypatch):
    """easyocr not importable → returns None (logged ImportError)."""
    monkeypatch.setenv("OCR_ENABLED", "true")
    monkeypatch.setenv("OCR_ENGINE", "easy")
    monkeypatch.setitem(sys.modules, "easyocr", None)

    from app.services.parser.image_parser import extract_text
    assert extract_text(_make_png_bytes()) is None


def test_paddle_engine_success(monkeypatch):
    """Mock PaddleOCR → joined Chinese + English lines."""
    monkeypatch.setenv("OCR_ENABLED", "true")
    monkeypatch.setenv("OCR_ENGINE", "paddle")

    fake_ocr = MagicMock()
    fake_ocr.ocr.return_value = [[
        [None, ("张三", 0.99)],
        [None, ("Python 工程师", 0.97)],
        [None, ("zhang.san@example.com", 0.95)],
    ]]
    fake_module = types.ModuleType("paddleocr")
    fake_module.PaddleOCR = MagicMock(return_value=fake_ocr)
    monkeypatch.setitem(sys.modules, "paddleocr", fake_module)

    from app.services.parser.image_parser import extract_text
    text = extract_text(_make_png_bytes())
    assert text == "张三\nPython 工程师\nzhang.san@example.com"


def test_paddle_engine_empty_result(monkeypatch):
    """PaddleOCR returns [None] (no detection) → None."""
    monkeypatch.setenv("OCR_ENABLED", "true")
    monkeypatch.setenv("OCR_ENGINE", "paddle")

    fake_ocr = MagicMock()
    fake_ocr.ocr.return_value = [None]
    fake_module = types.ModuleType("paddleocr")
    fake_module.PaddleOCR = MagicMock(return_value=fake_ocr)
    monkeypatch.setitem(sys.modules, "paddleocr", fake_module)

    from app.services.parser.image_parser import extract_text
    assert extract_text(_make_png_bytes()) is None


def test_easy_engine_success(monkeypatch):
    """Mock EasyOCR Reader.readtext → joined."""
    monkeypatch.setenv("OCR_ENABLED", "true")
    monkeypatch.setenv("OCR_ENGINE", "easy")

    fake_reader = MagicMock()
    fake_reader.readtext.return_value = ["李四", "Senior Engineer"]
    fake_module = types.ModuleType("easyocr")
    fake_module.Reader = MagicMock(return_value=fake_reader)
    monkeypatch.setitem(sys.modules, "easyocr", fake_module)

    from app.services.parser.image_parser import extract_text
    text = extract_text(_make_png_bytes())
    assert text == "李四\nSenior Engineer"


def test_engine_unhandled_exception_returns_none(monkeypatch):
    """Any non-ImportError exception inside engine → caught and returns None."""
    monkeypatch.setenv("OCR_ENABLED", "true")
    monkeypatch.setenv("OCR_ENGINE", "paddle")

    fake_ocr = MagicMock()
    fake_ocr.ocr.side_effect = RuntimeError("model corrupt")
    fake_module = types.ModuleType("paddleocr")
    fake_module.PaddleOCR = MagicMock(return_value=fake_ocr)
    monkeypatch.setitem(sys.modules, "paddleocr", fake_module)

    from app.services.parser.image_parser import extract_text
    assert extract_text(_make_png_bytes()) is None


def test_engine_loader_cached_across_calls(monkeypatch):
    """Engine instance should only be constructed once across multiple calls."""
    monkeypatch.setenv("OCR_ENABLED", "true")
    monkeypatch.setenv("OCR_ENGINE", "paddle")

    fake_ocr = MagicMock()
    fake_ocr.ocr.return_value = [[[None, ("hi", 1.0)]]]
    paddle_ctor = MagicMock(return_value=fake_ocr)
    fake_module = types.ModuleType("paddleocr")
    fake_module.PaddleOCR = paddle_ctor
    monkeypatch.setitem(sys.modules, "paddleocr", fake_module)

    from app.services.parser.image_parser import extract_text
    extract_text(_make_png_bytes())
    extract_text(_make_png_bytes())
    extract_text(_make_png_bytes())

    # PaddleOCR should be constructed exactly once thanks to lru_cache
    assert paddle_ctor.call_count == 1


def test_factory_dispatches_image_to_image_parser(monkeypatch):
    """Factory routes png/jpg → image_parser.extract_text."""
    from app.services.parser import factory, image_parser

    called = {}

    def fake_extract(content):
        called["got"] = content
        return "OCR_OUTPUT"

    monkeypatch.setattr(image_parser, "extract_text", fake_extract)
    out = factory.extract_text(b"<image-bytes>", "resume.png")
    assert out == "OCR_OUTPUT"
    assert called["got"] == b"<image-bytes>"


def test_factory_jpeg_extension_routed(monkeypatch):
    """Factory recognises .jpeg / .webp / .bmp variants."""
    from app.services.parser import factory, image_parser

    monkeypatch.setattr(image_parser, "extract_text", lambda c: "X")
    for name in ("a.jpeg", "b.JPG", "c.webp", "d.BMP"):
        assert factory.extract_text(b"x", name) == "X", f"failed for {name}"
