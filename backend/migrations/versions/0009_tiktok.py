"""Tiktok Mahjong: `matches.tiktok`, and each hand's yaku wall.

The group's own variant: beside the dora indicators, a wall of five yaku (and
five ura yaku under them), each revealed one worth 2 han to a hand that has
it. A third kind of match beside casual and ranked: never ranked -- a check
says so -- and left out of every player's stats.

`hands.yaku_dora` / `yaku_ura` hold what was face up when the hand ended and
the ura beneath, comma-separated; null outside Tiktok. Every match saved
before this was plain riichi, so the defaults are false and null.

Additive only, so it is safe on `main` (see DEPLOY.md). The check holds for
every existing row, since none is Tiktok.

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-10
"""
from alembic import op
import sqlalchemy as sa

revision = '0009'
down_revision = '0008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('tiktok', sa.Boolean(), server_default='false', nullable=False))
    op.create_check_constraint(op.f('ck_matches_tiktok_unranked'), 'matches', 'NOT (tiktok AND ranked)')
    op.add_column('hands', sa.Column('yaku_dora', sa.Text(), nullable=True))
    op.add_column('hands', sa.Column('yaku_ura', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('hands', 'yaku_ura')
    op.drop_column('hands', 'yaku_dora')
    op.drop_constraint(op.f('ck_matches_tiktok_unranked'), 'matches', type_='check')
    op.drop_column('matches', 'tiktok')
