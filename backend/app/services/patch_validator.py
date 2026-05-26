"""Patch validator + applier for JSON Resume schema (Phase 5 §8.36 A5).

This module is the **safety core** for AI-driven resume edits. It enforces a
whitelist of paths that AI can write to, rejecting any attempt to modify
structured fact fields like ``basics.email``, ``work[*].name``, ``work[*].startDate``,
etc. The whitelist exists because LLM output is fundamentally untrusted —
prompt rules are soft defense, this module is the hard defense.

See `MEMORY/PHASE5_PLAN.md` §2.2 for the full field property matrix.

Public API:
    - is_path_allowed(path: str) -> bool
    - apply_patch(resume_dict, path, new_value) -> dict (returns mutated copy)
    - apply_patches(resume_dict, patches) -> tuple[dict, list[dict]]
        Returns (mutated copy, list of rejected patches with reasons)
"""

from __future__ import annotations

import copy
import re
from typing import Any

# ─── Whitelist (Phase 5 §8.36 A5 hardening) ──────────────────────────
#
# Each entry is a regex anchored at start (^) and end ($). The list is OR'd:
# a path is allowed iff it matches at least one entry. Wildcards are escaped
# at runtime via _compile_whitelist(); index ``\d+`` matches any non-negative
# integer (e.g. ``work[0]``, ``work[12]``, but NOT ``work[-1]`` or
# ``work[abc]``).
#
# AI-writable fields are limited to free-text descriptive content:
#  - basics.summary (self-introduction text)
#  - work[*].summary / highlights[*]
#  - education[*].score (sometimes prose)
#  - projects[*].description / highlights[*] / keywords[*]
#  - skills[*].keywords[*]
#  - awards[*].summary
#
# Structured-fact fields (deliberately NOT in whitelist):
#  - basics.name / email / phone / url / location.* / desiredSalary / desiredLocation
#  - work[*].name / position / startDate / endDate / url
#  - education[*].institution / area / studyType / startDate / endDate
#  - skills[*].name / level
#  - projects[*].name / startDate / endDate
#
ALLOWED_PATH_PATTERNS = [
    r"basics\.summary",
    r"work\[\d+\]\.summary",
    r"work\[\d+\]\.highlights\[\d+\]",
    r"education\[\d+\]\.score",
    r"education\[\d+\]\.summary",
    r"projects\[\d+\]\.description",
    r"projects\[\d+\]\.highlights\[\d+\]",
    r"projects\[\d+\]\.keywords\[\d+\]",
    r"skills\[\d+\]\.keywords\[\d+\]",
    r"awards\[\d+\]\.summary",
    r"customSections\[\d+\]\.title",
    r"customSections\[\d+\]\.content",
]

_COMPILED_WHITELIST = re.compile("|".join(f"^(?:{p})$" for p in ALLOWED_PATH_PATTERNS))


_PATH_TOKEN_RE = re.compile(r"^([a-zA-Z]+)((?:\[\d+\])*)$")


def is_path_allowed(path: str) -> bool:
    """Return True iff *path* is in the AI-writable whitelist.

    Examples:
        >>> is_path_allowed("basics.summary")
        True
        >>> is_path_allowed("basics.email")    # blacklist: structured fact
        False
        >>> is_path_allowed("work[0].summary")
        True
        >>> is_path_allowed("work[0].name")    # blacklist
        False
        >>> is_path_allowed("__proto__.x")     # nonsense
        False
        >>> is_path_allowed("work[-1].summary")  # negative index rejected
        False
    """
    if not isinstance(path, str) or len(path) > 200:
        return False
    return bool(_COMPILED_WHITELIST.match(path))


def _resolve_parent_and_key(obj: Any, path: str) -> tuple[Any, str | int] | None:
    """Walk path from ``obj`` and return (parent, last_key) for in-place mutation.

    Returns None if path is invalid or any intermediate step is missing.
    """
    parts = path.split(".")
    cur = obj
    for i, part in enumerate(parts):
        m = _PATH_TOKEN_RE.match(part)
        if not m:
            return None
        name = m.group(1)
        index_part = m.group(2)
        # Walk into name field
        if not isinstance(cur, dict) or name not in cur:
            return None
        next_obj = cur[name]
        # Walk through any [N] indices
        indices = re.findall(r"\[(\d+)\]", index_part)
        if not indices:
            # No indices on this token; either we're done or there's more after dot
            if i == len(parts) - 1:
                return cur, name
            cur = next_obj
            continue
        # Has indices: walk N-1 levels into the array, leave last index as the "key"
        for idx_str in indices[:-1]:
            idx = int(idx_str)
            if not isinstance(next_obj, list) or idx >= len(next_obj):
                return None
            next_obj = next_obj[idx]
        # Last index: if this is the final path part, return (parent_array, idx)
        last_idx = int(indices[-1])
        if i == len(parts) - 1:
            if not isinstance(next_obj, list) or last_idx >= len(next_obj):
                return None
            return next_obj, last_idx
        # Otherwise continue walking: descend into the indexed element
        if not isinstance(next_obj, list) or last_idx >= len(next_obj):
            return None
        cur = next_obj[last_idx]
    return None


def apply_patch(resume_dict: dict[str, Any], path: str, new_value: Any) -> dict[str, Any]:
    """Apply a single patch to a JSON Resume dict. Returns a deep-copied mutated dict.

    Raises ``ValueError`` if path is not whitelisted or cannot be resolved.
    """
    if not is_path_allowed(path):
        raise ValueError(f"Path not allowed: {path}")
    if not isinstance(resume_dict, dict):
        raise ValueError("resume_dict must be a dict")
    out = copy.deepcopy(resume_dict)
    target = _resolve_parent_and_key(out, path)
    if target is None:
        raise ValueError(f"Path could not be resolved: {path}")
    parent, key = target
    parent[key] = new_value
    return out


def apply_patches(
    resume_dict: dict[str, Any],
    patches: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Apply a list of patches; return (mutated dict, rejected list with reasons).

    Each patch must be a dict with at least ``path`` (str) and ``new_value``
    fields. Rejected patches do not stop the loop — the caller decides how to
    surface them in UI.
    """
    out = copy.deepcopy(resume_dict)
    rejected: list[dict[str, Any]] = []
    for p in patches:
        if not isinstance(p, dict):
            rejected.append({"patch": p, "reason": "not a dict"})
            continue
        path = p.get("path")
        new_value = p.get("new_value")
        if not isinstance(path, str):
            rejected.append({"patch": p, "reason": "path missing or not a string"})
            continue
        if not is_path_allowed(path):
            rejected.append({"patch": p, "reason": "path not in whitelist (blocked)"})
            continue
        target = _resolve_parent_and_key(out, path)
        if target is None:
            rejected.append({"patch": p, "reason": "path cannot be resolved (target missing)"})
            continue
        parent, key = target
        parent[key] = new_value
    return out, rejected
