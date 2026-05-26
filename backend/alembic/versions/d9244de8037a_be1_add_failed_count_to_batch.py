"""BE1_add_failed_count_to_batch

Revision ID: d9244de8037a
Revises: 830cb960587c
Create Date: 2026-05-11 22:03:26.185223

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import sqlite

# revision identifiers, used by Alembic.
revision: str = 'd9244de8037a'
down_revision: Union[str, Sequence[str], None] = '830cb960587c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('batches', schema=None) as batch_op:
        batch_op.add_column(sa.Column('failed_count', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('batches', schema=None) as batch_op:
        batch_op.drop_column('failed_count')
