"""Image OCR for resume images (PNG / JPG / JPEG / WEBP / BMP).

Engines (configurable via OCR_ENGINE env / config.ocr.engine):
  - 'paddle' (default): PaddleOCR — best Chinese accuracy, ~400MB models
  - 'easy':             EasyOCR — multilingual, ~150MB models

Disabled by default (OCR_ENABLED=false). First call after enabling will
trigger model download to local cache (~/.paddlex or ~/.EasyOCR).

Engine instance is cached via lru_cache to avoid repeated model load.
Both backends are imported lazily so missing libs do not break startup.
"""

import logging
from functools import lru_cache
from io import BytesIO

from PIL import Image

from app.config import get_config

logger = logging.getLogger(__name__)


# ---------------- engine loaders (lazy + cached) ----------------

@lru_cache(maxsize=1)
def _load_paddle(lang: str):
    """Lazy-load PaddleOCR. Cached so the ~400MB model loads only once."""
    from paddleocr import PaddleOCR  # noqa: WPS433 — intentional lazy import
    return PaddleOCR(lang=lang)


@lru_cache(maxsize=1)
def _load_easy(langs_csv: str):
    """Lazy-load EasyOCR. Cached so the ~150MB model loads only once."""
    import easyocr  # noqa: WPS433 — intentional lazy import
    langs = [s.strip() for s in langs_csv.split(",") if s.strip()]
    return easyocr.Reader(langs, gpu=False)


# ---------------- helpers ----------------

def _to_numpy(content: bytes):
    """Decode image bytes → RGB numpy array (PaddleOCR / EasyOCR friendly)."""
    import numpy as np
    img = Image.open(BytesIO(content))
    if img.mode != "RGB":
        img = img.convert("RGB")
    return np.array(img)


def _ocr_paddle(arr, lang: str) -> list[str]:
    ocr = _load_paddle(lang)
    result = ocr.ocr(arr)
    if not result or not result[0]:
        return []
    # PaddleOCR shape: [[ [box], (text, confidence) ], ...]
    return [line[1][0] for line in result[0] if line and len(line) > 1]


def _ocr_easy(arr, langs_csv: str) -> list[str]:
    reader = _load_easy(langs_csv)
    # detail=0 → only return text strings, no boxes/confidence
    result = reader.readtext(arr, detail=0)
    return list(result) if result else []


# ---------------- public API ----------------

def extract_text(content: bytes) -> str | None:
    """Extract text from image bytes via the configured OCR engine.

    Returns None when:
      - OCR is disabled (config.ocr.enabled = False) — default
      - Image bytes invalid / cannot be decoded
      - OCR library not installed
      - OCR yields no text
      - Any unexpected failure (caught and logged)
    """
    cfg = get_config().ocr
    if not cfg.enabled:
        return None

    try:
        arr = _to_numpy(content)
    except Exception as e:
        logger.warning("image decode failed: %s", e)
        return None

    try:
        if cfg.engine == "easy":
            # EasyOCR uses comma-separated codes; map our 'ch' shortcut → 'ch_sim,en'
            langs = "ch_sim,en" if cfg.lang == "ch" else cfg.lang
            lines = _ocr_easy(arr, langs)
        else:
            lines = _ocr_paddle(arr, cfg.lang)
    except ImportError as e:
        logger.warning("OCR engine '%s' not installed: %s", cfg.engine, e)
        return None
    except Exception as e:
        logger.warning("OCR failed (%s): %s", cfg.engine, e)
        return None

    text = "\n".join(s.strip() for s in lines if s and s.strip())
    return text or None
