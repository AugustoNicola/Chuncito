# Backend chores. Everything targets the dev branch unless you say otherwise:
#   make db-migrate TARGET=main
TARGET ?= dev
PY := backend/.venv/bin/python
export CHUNCITO_TARGET := $(TARGET)

.PHONY: backend-setup backend-dev backend-test db-backup db-migrate db-status

backend-setup:          ## Python venv with runtime + test dependencies
	python3 -m venv backend/.venv
	backend/.venv/bin/pip install -q -r backend/requirements-dev.txt

backend-dev:            ## API on :8000, which Vite proxies /api to (needs CHUNCITO_PIN)
	cd backend && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

backend-test:           ## pytest against a throwaway schema on the dev branch
	cd backend && .venv/bin/pytest -q

db-backup:              ## pg_dump the target into backups/
	cd backend && .venv/bin/python -m scripts.db_backup

# No automatic backup yet: main is empty, and Neon's restore window covers the
# early days. Once real matches are in, run `make db-backup` first (it needs
# postgresql-client-18), or make this target depend on it again.
db-migrate:             ## bring the target to the latest migration
	cd backend && .venv/bin/alembic upgrade head

db-status:              ## which migration the target is at
	cd backend && .venv/bin/alembic current
