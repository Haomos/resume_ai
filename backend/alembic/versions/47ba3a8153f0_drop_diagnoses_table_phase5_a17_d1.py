"""drop_diagnoses_table_phase5_a17_d1

Phase 5 §8.36 A17 D1: drop the `diagnoses` table.

§8.34 Phase B 引入新评分框架（model_config_json.assessment）后，
`diagnoses` 表被废弃。A14/A15 删除编辑器入口和后端 endpoint 后，
该表既不写也不读，是纯 dead schema。

执行前实测（2026-05-10）：`SELECT COUNT(*) FROM diagnoses` = 0，
零数据销毁风险。如需恢复，downgrade() 重建表结构（数据无法恢复但
当前为 0 行所以无影响）。

Revision ID: 47ba3a8153f0
Revises: 2bd116b7dd00
Create Date: 2026-05-11 00:21:42.968297

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '47ba3a8153f0'
down_revision: Union[str, Sequence[str], None] = '2bd116b7dd00'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop diagnoses table + its indexes."""
    op.execute("DROP INDEX IF EXISTS ix_diagnoses_resume_id")
    op.execute("DROP INDEX IF EXISTS ix_diagnoses_id")
    op.execute("DROP TABLE IF EXISTS diagnoses")


def downgrade() -> None:
    """Recreate diagnoses table (schema only — original rows unrecoverable).

    Mirrors the 0e528a336a6c original creation migration so the schema
    returns to identical state if downgrade is exercised.
    """
    op.execute("""
        CREATE TABLE IF NOT EXISTS diagnoses (
            id INTEGER NOT NULL PRIMARY KEY,
            resume_id INTEGER NOT NULL,
            overall_score INTEGER NOT NULL,
            dimension_scores_json JSON,
            strengths JSON,
            weaknesses JSON,
            action_items JSON,
            model_config_json JSON,
            created_at DATETIME NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_diagnoses_id ON diagnoses (id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_diagnoses_resume_id ON diagnoses (resume_id)")
