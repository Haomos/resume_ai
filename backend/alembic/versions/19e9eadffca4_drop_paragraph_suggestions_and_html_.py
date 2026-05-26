"""drop_paragraph_suggestions_and_html_columns

Revision ID: 19e9eadffca4
Revises: d9244de8037a
Create Date: 2026-05-13 12:09:38.478232

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = '19e9eadffca4'
down_revision: Union[str, Sequence[str], None] = 'd9244de8037a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    - 清理 analyses.paragraph_suggestions_json（§8.34 后废弃，39 行已 salvage）
    - 清理 resumes.html（§8.43 后废弃，2 行非空可丢弃）

    Note: 此 migration **不再**包含 `DROP TABLE diagnoses` — 前置 migration
    `47ba3a8153f0_drop_diagnoses_table_phase5_a17_d1` 已负责该清理。
    Phase 6（2026-05-16 §8.45）Docker 化时发现 autogenerate 把 diagnoses
    的 drop 重复加进了本 migration（fresh DB 上跑 `47ba3a8153f0` 后表已
    不存在，再次 drop 没用 IF EXISTS 就崩），故移除。
    """
    # Drop deprecated columns (data salvaged where needed)
    with op.batch_alter_table('analyses', schema=None) as batch_op:
        batch_op.drop_column('paragraph_suggestions_json')

    with op.batch_alter_table('resumes', schema=None) as batch_op:
        batch_op.drop_column('html')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('resumes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('html', sa.TEXT(), nullable=True))

    with op.batch_alter_table('analyses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('paragraph_suggestions_json', sqlite.JSON(), nullable=True))

    # Note: diagnoses 表的 downgrade 由 `47ba3a8153f0` 的 downgrade() 负责
    # （重建表 + 索引）。本 migration 不再 mirror 那个操作。
