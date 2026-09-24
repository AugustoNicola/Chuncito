"""`matches.ranked`: whether a match counts towards MAKApoints.

Chosen when a match is saved. Matches saved before MAKApoints existed were
not played for them, so they start unranked.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-24
"""
from alembic import op
import sqlalchemy as sa

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('ranked', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('matches', 'ranked')
