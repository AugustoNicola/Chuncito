"""`matches.target_score`: what results are measured against, for the oka.

Every match saved before it was played without oka -- placements were uma
alone -- which is what a target equal to the starting points means, so that
is what they get.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-24
"""
from alembic import op
import sqlalchemy as sa

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('target_score', sa.Integer(), nullable=True))
    op.execute('update matches set target_score = starting_points')
    op.alter_column('matches', 'target_score', nullable=False)


def downgrade() -> None:
    op.drop_column('matches', 'target_score')
