"""Unit + regression tests for the structured_extractor education parser.

Locks in the §8.41 fix: block-based education parsing that anchors on school
name and merges following degree/major/period lines into the same entry,
instead of the old per-line scanner that created duplicate entries.

Real-world bug we are guarding against:
    Resume layout:
        湖南大学
        本科 · 车辆工程
    Old parser produced 2 entries (one per EDU keyword line). New parser
    produces 1 entry with school + degree + major properly merged.
"""

from pathlib import Path

import pytest

from app.services.parser.structured_extractor import (
    _extract_education,
    _extract_legacy_dict,
    extract_structured_json,
)
from app.services.parser.pdf_parser import extract_text


_FIXTURE_DIR = Path(__file__).resolve().parents[3] / "MEMORY" / "private" / "resumes"


class TestExtractEducationBlock:
    """Unit tests on the block-based parser with hand-crafted line input."""

    def test_school_then_degree_major_merges_into_one_entry(self):
        """The core §8.41 fix: 校名 + 学位+专业 两行合并为一条，不是两条。"""
        lines = ["湖南大学", "本科 · 车辆工程"]
        edus = _extract_education(lines)
        assert len(edus) == 1
        assert edus[0]["school"] == "湖南大学"
        assert edus[0]["degree"] == "本科"
        assert edus[0]["major"] == "车辆工程"
        assert edus[0]["period"] == ""

    def test_school_with_inline_date(self):
        """Date on a following line is merged into the open entry.

        Note: ``_DATE_RE`` 当前只匹配到结束年（不带月份）— 这是 pre-existing
        characteristic of the regex, not part of §8.41 fix.
        """
        lines = ["清华大学", "硕士 · 计算机科学", "2018年09月 - 2021年06月"]
        edus = _extract_education(lines)
        assert len(edus) == 1
        assert edus[0]["school"] == "清华大学"
        assert edus[0]["degree"] == "硕士"
        assert edus[0]["major"] == "计算机科学"
        # _DATE_RE 当前只匹配到结束年（不带月份），是已知限制
        assert edus[0]["period"].startswith("2018年09月")
        assert "2021" in edus[0]["period"]

    def test_two_separate_schools(self):
        """Bachelor at A + Master at B → 2 entries (each school anchors a new block)."""
        lines = [
            "北京大学",
            "本科 · 数学",
            "2014年09月 - 2018年06月",
            "麻省理工学院",
            "硕士 · 应用数学",
            "2019年09月 - 2021年06月",
        ]
        edus = _extract_education(lines)
        assert len(edus) == 2
        assert edus[0]["school"] == "北京大学"
        assert edus[0]["degree"] == "本科"
        assert edus[1]["school"] == "麻省理工学院"
        assert edus[1]["degree"] == "硕士"

    def test_summary_line_with_university_is_not_an_entry(self):
        """长句中提到的"大学"不应触发新条目（len < 40 过滤）。"""
        lines = [
            "工科背景（湖南大学），通过系统自学与项目实践完成向AI领域的转型，具备大模型微调经验",
            "湖南大学",
            "本科 · 车辆工程",
        ]
        edus = _extract_education(lines)
        # 第一行 > 40 字 → 不算锚点；后两行合并为 1 条
        assert len(edus) == 1
        assert edus[0]["school"] == "湖南大学"
        assert edus[0]["degree"] == "本科"

    def test_degree_before_school_is_dropped(self):
        """学位行先出现而无校名锚点 → 已知 v1 局限：丢弃（不创建空 entry）。"""
        lines = ["本科 · 车辆工程"]
        edus = _extract_education(lines)
        assert len(edus) == 0

    def test_empty_input(self):
        assert _extract_education([]) == []

    def test_irrelevant_lines_ignored(self):
        """工作内容行不应该被误识别为学历。"""
        lines = [
            "湖南大学",
            "本科 · 车辆工程",
            "编程指导老师",
            "负责小学 3 ~ 6 年级学生的编程入门教学",
            "景嘉微电子股份有限公司",
            "结构工程师",
        ]
        edus = _extract_education(lines)
        assert len(edus) == 1
        assert edus[0]["school"] == "湖南大学"

    def test_school_inline_date_and_degree(self):
        """单行同时含校名 + 日期：日期入 period，校名清理掉日期片段。

        Note: ``_DATE_RE`` 当前只匹配到结束年（不带月份），是已知限制。
        """
        lines = ["湖南大学 2017年09月 - 2021年06月"]
        edus = _extract_education(lines)
        assert len(edus) == 1
        assert "湖南大学" in edus[0]["school"]
        assert edus[0]["period"].startswith("2017年09月")
        assert "2021" in edus[0]["period"]

    def test_two_letter_degree_majors_partial(self):
        """带分隔符的 '本科 · 车辆工程' / '硕士、计算机' / '博士/AI' 都能拆出 major。"""
        for sep in [" · ", "、", "/", " ", "-"]:
            lines = ["示例大学", f"本科{sep}计算机"]
            edus = _extract_education(lines)
            assert len(edus) == 1, f"failed sep={sep!r}"
            assert edus[0]["degree"] == "本科"
            assert edus[0]["major"] == "计算机", f"failed sep={sep!r}, got major={edus[0]['major']!r}"

    def test_dual_degree_under_same_school_splits_into_two_entries(self):
        """§8.55 fix: 同一所学校下两个连续学位块 → 拆成 2 条，不再相互覆盖。

        典型布局：
            清华大学
            本科  计算机
            2014年 - 2018年
            硕士  AI
            2018年 - 2021年

        之前行为：第二次遇到 degree 行时静默覆盖第一条 entry 的 degree/major
        （`current["degree"] = current["degree"] or deg` 但 major 直接覆盖）。
        修复后：遇到第二个 degree 行时，flush 当前 entry，并以同一个 school
        名字开新 entry。
        """
        lines = [
            "清华大学",
            "本科 计算机",
            "2014年09月 - 2018年06月",
            "硕士 AI",
            "2018年09月 - 2021年06月",
        ]
        edus = _extract_education(lines)
        assert len(edus) == 2, f"expected 2 entries, got {len(edus)}: {edus}"

        # First degree
        assert edus[0]["school"] == "清华大学"
        assert edus[0]["degree"] == "本科"
        assert edus[0]["major"] == "计算机"
        assert edus[0]["period"].startswith("2014年09月")
        assert "2018" in edus[0]["period"]

        # Second degree — school name is carried over
        assert edus[1]["school"] == "清华大学"
        assert edus[1]["degree"] == "硕士"
        assert edus[1]["major"] == "AI"
        assert edus[1]["period"].startswith("2018年09月")
        assert "2021" in edus[1]["period"]


class TestEducationRegressionFromPdf:
    """End-to-end regression tests using real PDF fixtures.

    Locks in: example_1.pdf (older layout, inline dates) → 1 entry, not 3.
    example_1_20260511.pdf (newer layout, dates in separate column) → 1 entry, not 2.
    """

    @pytest.mark.parametrize(
        "pdf_name,expected_school,expected_degree,expected_major,expect_period",
        [
            ("example_1.pdf", "湖南大学", "本科", "车辆工程", True),
            ("example_1_20260511.pdf", "湖南大学", "本科", "车辆工程", False),
            ("example_1_20260511 (1).pdf", "湖南大学", "本科", "车辆工程", False),
            ("example_1_20260511 (2).pdf", "湖南大学", "本科", "车辆工程", False),
        ],
    )
    def test_pdf_produces_exactly_one_entry(
        self,
        pdf_name: str,
        expected_school: str,
        expected_degree: str,
        expected_major: str,
        expect_period: bool,
    ):
        pdf_path = _FIXTURE_DIR / pdf_name
        if not pdf_path.exists():
            pytest.skip(f"sample PDF not present: {pdf_path}")
        text = extract_text(pdf_path.read_bytes())
        assert text, f"PDF text extraction failed for {pdf_name}"

        legacy = _extract_legacy_dict(text)
        edus = legacy.get("education", [])
        assert len(edus) == 1, (
            f"§8.41 regression — {pdf_name} should produce exactly 1 education "
            f"entry, got {len(edus)}: {edus}"
        )
        assert edus[0]["school"] == expected_school
        assert edus[0]["degree"] == expected_degree
        assert edus[0]["major"] == expected_major
        if expect_period:
            assert edus[0]["period"], f"expected period for {pdf_name}, got empty"

    def test_json_resume_output_has_one_education(self):
        """End-to-end: PDF → legacy → JSON Resume schema → education length 1."""
        pdf_path = _FIXTURE_DIR / "example_1.pdf"
        if not pdf_path.exists():
            pytest.skip(f"sample PDF not present: {pdf_path}")
        text = extract_text(pdf_path.read_bytes())
        assert text

        json_resume = extract_structured_json(text)
        assert len(json_resume["education"]) == 1
        edu0 = json_resume["education"][0]
        assert edu0["institution"] == "湖南大学"
        assert edu0["studyType"] == "本科"
        assert edu0["area"] == "车辆工程"
