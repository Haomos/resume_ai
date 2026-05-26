"""add_line_height_to_resume_phase5_a11

Phase 5 §8.36 A11: replace ``<!--lh:1.7-->`` HTML comment hack with a
proper ``Resume.line_height`` column.

Pre-A11 the free-form editor wrote line-height as an HTML comment at the
head of ``resume.html`` (``<!--lh:1.7-->``) and the loader regex-stripped
it on render. This migration introduces a dedicated column so:

- Both editors (free-form + structured) read/write the same source of truth.
- PDF renderer doesn't have to scrape an HTML comment.
- The legacy comment in existing rows still works as a frontend fallback
  during the transition (the column is null, so the parser keeps reading
  the comment until the user changes line-height again).

Revision ID: 830cb960587c
Revises: 47ba3a8153f0
Create Date: 2026-05-11 00:41:20.629211

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '830cb960587c'
down_revision: Union[str, Sequence[str], None] = '47ba3a8153f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add nullable ``line_height`` Float column to ``resumes``."""
    with op.batch_alter_table('resumes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('line_height', sa.Float(), nullable=True))


def downgrade() -> None:
    """Drop ``line_height`` column."""
    with op.batch_alter_table('resumes', schema=None) as batch_op:
        batch_op.drop_column('line_height')
