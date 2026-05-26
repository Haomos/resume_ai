"""add_record_type_and_master_pool_phase7

Revision ID: e45bee40c24c
Revises: 19e9eadffca4
Create Date: 2026-05-23 16:34:01.963263

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e45bee40c24c'
down_revision: Union[str, Sequence[str], None] = '19e9eadffca4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add record_type to resumes, mark existing rows as legacy, create blank master_pool."""
    # Step 1: add nullable record_type column
    with op.batch_alter_table('resumes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('record_type', sa.String(length=20), nullable=True))

    # Step 2: mark all existing rows as legacy
    resumes_table = sa.table('resumes', sa.column('record_type'))
    op.execute(resumes_table.update().values(record_type='legacy'))

    # Step 3: create one blank master_pool entry for seeker mode
    op.execute(
        sa.text("""
            INSERT INTO resumes (filename, storage_path, structured_json, schema_version, raw_text, record_type, created_at)
            VALUES ('', '', '{}', 'json-resume-1.0.0+resumeai', '', 'master_pool', datetime('now'))
        """)
    )


def downgrade() -> None:
    """Drop record_type column."""
    with op.batch_alter_table('resumes', schema=None) as batch_op:
        batch_op.drop_column('record_type')
