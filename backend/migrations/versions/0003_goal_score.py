"""`matches.return_score` becomes `goal_score`: the score that ends the match.

It only ever meant that; the new name keeps it apart from the *target* score
that placements are measured against (oka), which is a separate thing.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-24
"""
from alembic import op

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('matches', 'return_score', new_column_name='goal_score')


def downgrade() -> None:
    op.alter_column('matches', 'goal_score', new_column_name='return_score')
