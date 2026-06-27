"""On-demand text translation for dynamic database content."""

from __future__ import annotations

import hashlib
from typing import Iterable

from deep_translator import GoogleTranslator

# In-process cache: hash -> translated text
_cache: dict[str, str] = {}
_MAX_CACHE = 5000


def _cache_key(text: str, target: str) -> str:
    digest = hashlib.sha256(f"{target}:{text}".encode()).hexdigest()
    return digest


def _normalize_target(target: str) -> str:
    t = (target or "ar").strip().lower()
    return "ar" if t.startswith("ar") else "en"


def translate_text(text: str, target_lang: str = "ar") -> str:
    source = (text or "").strip()
    if not source:
        return source

    target = _normalize_target(target_lang)
    if target == "en":
        return source

    key = _cache_key(source, target)
    cached = _cache.get(key)
    if cached is not None:
        return cached

    translated = GoogleTranslator(source="auto", target=target).translate(source)
    result = (translated or source).strip() or source

    if len(_cache) >= _MAX_CACHE:
        _cache.clear()
    _cache[key] = result
    return result


def translate_texts(texts: Iterable[str], target_lang: str = "ar") -> list[str]:
    return [translate_text(t, target_lang) for t in texts]
