"""The migration builds exactly the schema the code expects, and can be undone."""
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import text

from app.models import metadata
from scripts.check_migrations import revisions
from tests.conftest import alembic_config


def test_the_migrated_database_matches_the_models(engine):
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), metadata)
    assert diff == []


def test_the_migration_downgrades_and_upgrades_cleanly(engine):
    with engine.begin() as conn:
        command.downgrade(alembic_config(conn), 'base')
        left = conn.execute(text(
            "select count(*) from information_schema.tables "
            "where table_schema = current_schema() and table_name <> 'alembic_version'"
        )).scalar()
        assert left == 0
        command.upgrade(alembic_config(conn), 'head')


def test_level_rank_is_derived_from_the_level(engine):
    with engine.begin() as conn:
        ranks = conn.execute(text("""
            insert into matches (id, players, red_fives, length, starting_points, target_score,
                                 goal_score, uma, status, started_at, max_level)
            values ('r0', 4, true, 'south', 25000, 30000, 30000, '[]', 'finished', now(), null),
                   ('r1', 4, true, 'south', 25000, 30000, 30000, '[]', 'finished', now(), 'mangan'),
                   ('r2', 4, true, 'south', 25000, 30000, 30000, '[]', 'finished', now(), 'dobleYakuman'),
                   ('r3', 4, true, 'south', 25000, 30000, 30000, '[]', 'finished', now(), '4xYakuman')
            returning id, max_level_rank
        """)).all()
        conn.rollback()
    assert dict(ranks) == {'r0': None, 'r1': 1, 'r2': 7, 'r3': 6}


def test_the_release_refuses_a_database_behind_the_code(engine):
    with engine.begin() as conn:
        current, expected = revisions(conn)
        assert current == expected and expected
        command.downgrade(alembic_config(conn), 'base')
        current, expected = revisions(conn)
        assert current == set() and expected
        command.upgrade(alembic_config(conn), 'head')
