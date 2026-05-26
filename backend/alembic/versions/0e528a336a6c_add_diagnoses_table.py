"""add-diagnoses-table

Revision ID: 0e528a336a6c
Revises: dc99b391ae64
Create Date: 2026-05-09 17:25:36.814081

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0e528a336a6c'
down_revision: Union[str, Sequence[str], None] = 'dc99b391ae64'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_diagnoses_resume_id")
    op.execute("DROP INDEX IF EXISTS ix_diagnoses_id")
    op.execute("DROP TABLE IF EXISTS diagnoses")
