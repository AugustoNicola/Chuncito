"""`hands.recorded_at`: when each hand was recorded, so how long it took.

A hand lasted from the one before it (or the match's start) to its own
recording. Hands saved before this have no time: the column is nullable and
nothing is backfilled, since there is nothing true to backfill it with. A
match's total needs no new column -- `started_at` and `ended_at` were always
there.

Additive only, so it is safe on `main` (see DEPLOY.md).

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-12
"""
from alembic import op
import sqlalchemy as sa

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('hands', sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('hands', 'recorded_at')
