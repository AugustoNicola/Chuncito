"""`matches.imported`: a match played without the tracker, entered afterwards.

Such a match has its final scores (as adjustments) and nothing else: no hands,
no end time. Every match saved before this was played in the tracker, so the
default is false.

Additive only, so it is safe on `main` (see DEPLOY.md).

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-14
"""
from alembic import op
import sqlalchemy as sa

revision = '0008'
down_revision = '0007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('imported', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('matches', 'imported')
