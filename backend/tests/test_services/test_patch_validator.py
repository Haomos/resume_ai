"""Tests for patch_validator (Phase 5 §8.36 A5 — AI patch safety core).

This is the **safety boundary** that prevents LLM from writing structured-fact
fields like basics.email, work[*].name, etc. These tests must NEVER regress.
"""

import pytest
from app.services.patch_validator import (
    is_path_allowed,
    apply_patch,
    apply_patches,
)


# ─── Whitelist allow/deny tests ──────────────────────────


class TestPathWhitelist:
    """Verify path whitelist correctly allows/denies AI-writable paths."""

    @pytest.mark.parametrize("path", [
        "basics.summary",
        "work[0].summary",
        "work[2].summary",
        "work[10].summary",
        "work[0].highlights[0]",
        "work[1].highlights[5]",
        "education[0].score",
        "education[0].summary",
        "projects[0].description",
        "projects[3].description",
        "projects[0].highlights[2]",
        "projects[1].keywords[0]",
        "skills[0].keywords[0]",
        "skills[5].keywords[3]",
        "awards[0].summary",
        "customSections[0].title",
        "customSections[1].content",
    ])
    def test_allowed_paths(self, path: str):
        assert is_path_allowed(path), f"Should be allowed: {path}"

    @pytest.mark.parametrize("path", [
        # Structured fact fields — must be denied
        "basics.name",
        "basics.email",
        "basics.phone",
        "basics.url",
        "basics.location.city",
        "basics.desiredSalary",
        "basics.desiredLocation",
        "work[0].name",
        "work[0].position",
        "work[0].startDate",
        "work[0].endDate",
        "work[0].url",
        "education[0].institution",
        "education[0].area",
        "education[0].studyType",
        "education[0].startDate",
        "skills[0].name",
        "skills[0].level",
        "projects[0].name",
        "projects[0].startDate",
        # Junk / injection
        "__proto__.x",
        "constructor.prototype.y",
        "basics.summary; DROP TABLE",
        "work[-1].summary",
        "work[abc].summary",
        "work[0].summary.extra",
        "",
        "basics",
    ])
    def test_denied_paths(self, path: str):
        assert not is_path_allowed(path), f"Should be denied: {path}"

    def test_non_string_input(self):
        assert not is_path_allowed(None)  # type: ignore
        assert not is_path_allowed(123)  # type: ignore
        assert not is_path_allowed({"path": "basics.summary"})  # type: ignore

    def test_too_long_path(self):
        long_path = "work[0]." + ("x" * 300)
        assert not is_path_allowed(long_path)


# ─── Apply patch happy path ──────────────────────────


class TestApplyPatch:

    def _sample(self):
        return {
            "basics": {"name": "张三", "email": "z@x.com", "summary": "old summary"},
            "work": [
                {"name": "公司A", "summary": "old A summary", "highlights": ["h1", "h2"]},
                {"name": "公司B", "summary": "old B summary", "highlights": []},
            ],
            "education": [{"institution": "清华", "score": "old score", "summary": "old edu summary"}],
            "projects": [{"name": "项目X", "description": "old desc", "highlights": ["p1"], "keywords": ["k1", "k2"]}],
            "skills": [{"name": "Python", "keywords": ["fastapi", "django"]}],
            "customSections": [{"title": "专利", "content": "old patent"}],
        }

    def test_apply_basics_summary(self):
        out = apply_patch(self._sample(), "basics.summary", "new summary text")
        assert out["basics"]["summary"] == "new summary text"
        assert out["basics"]["name"] == "张三"
        assert out["basics"]["email"] == "z@x.com"

    def test_apply_work_summary(self):
        out = apply_patch(self._sample(), "work[1].summary", "rewritten B")
        assert out["work"][1]["summary"] == "rewritten B"
        assert out["work"][0]["summary"] == "old A summary"
        assert out["work"][1]["name"] == "公司B"

    def test_apply_work_highlight(self):
        out = apply_patch(self._sample(), "work[0].highlights[1]", "new h2")
        assert out["work"][0]["highlights"] == ["h1", "new h2"]

    def test_apply_education_summary(self):
        out = apply_patch(self._sample(), "education[0].summary", "新教育描述")
        assert out["education"][0]["summary"] == "新教育描述"
        assert out["education"][0]["institution"] == "清华"

    def test_apply_project_keyword(self):
        out = apply_patch(self._sample(), "projects[0].keywords[0]", "Kubernetes")
        assert out["projects"][0]["keywords"][0] == "Kubernetes"
        assert out["projects"][0]["keywords"][1] == "k2"

    def test_apply_skill_keyword(self):
        out = apply_patch(self._sample(), "skills[0].keywords[0]", "Pydantic")
        assert out["skills"][0]["keywords"] == ["Pydantic", "django"]

    def test_returns_deep_copy(self):
        sample = self._sample()
        out = apply_patch(sample, "basics.summary", "new")
        assert sample["basics"]["summary"] == "old summary"
        assert out["basics"]["summary"] == "new"

    def test_apply_custom_section_title(self):
        out = apply_patch(self._sample(), "customSections[0].title", "新专利标题")
        assert out["customSections"][0]["title"] == "新专利标题"
        assert out["customSections"][0]["content"] == "old patent"

    def test_apply_custom_section_content(self):
        out = apply_patch(self._sample(), "customSections[0].content", "新专利内容")
        assert out["customSections"][0]["content"] == "新专利内容"


# ─── Apply patch rejection ──────────────────────────


class TestApplyPatchRejection:

    def _sample(self):
        return {
            "basics": {"name": "X", "email": "x@y.com", "summary": "s"},
            "work": [{"name": "A", "summary": "ws"}],
        }

    def test_blocks_basics_email(self):
        with pytest.raises(ValueError, match="not allowed"):
            apply_patch(self._sample(), "basics.email", "fake@evil.com")

    def test_blocks_work_name(self):
        with pytest.raises(ValueError, match="not allowed"):
            apply_patch(self._sample(), "work[0].name", "FakeCompany")

    def test_blocks_proto_pollution(self):
        with pytest.raises(ValueError, match="not allowed"):
            apply_patch(self._sample(), "__proto__.x", "owned")

    def test_unresolvable_path(self):
        with pytest.raises(ValueError, match="could not be resolved"):
            apply_patch(self._sample(), "work[5].summary", "out of range")

    def test_blocks_with_long_path(self):
        with pytest.raises(ValueError, match="not allowed"):
            long_path = "work[0]." + ("x" * 300)
            apply_patch(self._sample(), long_path, "evil")


# ─── Apply patches batch ──────────────────────────


class TestApplyPatches:

    def _sample(self):
        return {
            "basics": {"name": "X", "email": "x@y.com", "summary": "s"},
            "work": [{"name": "A", "summary": "ws", "highlights": ["h1"]}],
            "skills": [{"name": "Python", "keywords": ["fastapi"]}],
        }

    def test_apply_multiple_valid(self):
        patches = [
            {"path": "basics.summary", "new_value": "new s"},
            {"path": "work[0].summary", "new_value": "new ws"},
        ]
        out, rejected = apply_patches(self._sample(), patches)
        assert out["basics"]["summary"] == "new s"
        assert out["work"][0]["summary"] == "new ws"
        assert rejected == []

    def test_partial_rejection(self):
        """LLM 试图编造 email — 必须被拒绝且其他 patch 仍生效."""
        patches = [
            {"path": "basics.summary", "new_value": "legit summary"},
            {"path": "basics.email", "new_value": "fake@evil.com"},  # ← evil
            {"path": "work[0].summary", "new_value": "legit work summary"},
        ]
        out, rejected = apply_patches(self._sample(), patches)
        # Legit changes applied
        assert out["basics"]["summary"] == "legit summary"
        assert out["work"][0]["summary"] == "legit work summary"
        # Email NOT changed
        assert out["basics"]["email"] == "x@y.com"
        # Rejection logged with reason
        assert len(rejected) == 1
        assert rejected[0]["patch"]["path"] == "basics.email"
        assert "blocked" in rejected[0]["reason"]

    def test_8_35_simulation_fake_salary(self):
        """§8.35-fix 案例：LLM 试图编造期望薪资 — 必须被结构层拦下."""
        evil_patches = [
            {"path": "basics.desiredSalary", "new_value": "12-15K"},
            {"path": "basics.desiredLocation", "new_value": "北京/远程"},
        ]
        out, rejected = apply_patches(self._sample(), evil_patches)
        # 全部被拒
        assert len(rejected) == 2
        assert all("blocked" in r["reason"] for r in rejected)
        # 数据未污染
        assert "desiredSalary" not in out["basics"] or out["basics"].get("desiredSalary") in (None, "")

    def test_invalid_patch_shape(self):
        patches = [
            "not a dict",  # type: ignore
            {"path": 123, "new_value": "x"},  # path not string
            {"new_value": "x"},  # path missing
        ]
        out, rejected = apply_patches(self._sample(), patches)
        assert len(rejected) == 3
        # Original unchanged
        assert out == self._sample()