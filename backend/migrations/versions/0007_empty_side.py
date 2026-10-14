"""`matches.empty_side`: the side of a sanma table nobody sits at.

Chosen at setup so the match screen matches the real table. Null with four
players, and on sanma matches saved before it was a choice -- those had the
left side empty, which is what the client reads a null as.

Additive only, so it is safe on `main` (see DEPLOY.md).

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-14
"""
from alembic import op
import sqlalchemy as sa

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('empty_side', sa.Text(), nullable=True))
    op.create_check_constraint(
        op.f('ck_matches_empty_side'), 'matches',
        "empty_side IS NULL OR (players = 3 AND empty_side IN ('bottom', 'right', 'top', 'left'))")


def downgrade() -> None:
    op.drop_constraint(op.f('ck_matches_empty_side'), 'matches', type_='check')
    op.drop_column('matches', 'empty_side')
