# Backend chores. Everything targets the dev branch unless you say otherwise:
#   make db-migrate TARGET=main
TARGET ?= dev
PY := backend/.venv/bin/python
export CHUNCITO_TARGET := $(TARGET)

.PHONY: backend-setup backend-dev backend-test db-backup backup-timer db-migrate db-status db-check

backend-setup:          ## Python venv with runtime + test dependencies
	python3 -m venv backend/.venv
	backend/.venv/bin/pip install -q -r backend/requirements-dev.txt

backend-dev:            ## API on :8000, which Vite proxies /api to (needs CHUNCITO_PIN)
	cd backend && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

backend-test:           ## pytest against a throwaway schema on the dev branch
	cd backend && .venv/bin/pytest -q

# KEEP=N marks a scheduled dump and keeps only the newest N of those; dumps
# without it (by hand, before a migration) are never pruned.
db-backup:              ## pg_dump the target into backups/ (needs postgresql-client-18)
	cd backend && .venv/bin/python -m scripts.db_backup $(if $(KEEP),--keep $(KEEP))

backup-timer:           ## install the daily backup of main as a systemd user timer
	mkdir -p $(HOME)/.config/systemd/user
	for unit in backend/systemd/*; do \
		sed 's|@REPO@|$(CURDIR)|g' $$unit > $(HOME)/.config/systemd/user/$$(basename $$unit); \
	done
	systemctl --user daemon-reload
	systemctl --user enable --now chuncito-backup.timer
	systemctl --user list-timers chuncito-backup.timer

# Production data is never lost to a migration: on main, no backup, no migration.
db-migrate: $(if $(filter main,$(TARGET)),db-backup)  ## bring the target to the latest migration
	cd backend && .venv/bin/alembic upgrade head

db-status:              ## which migration the target is at
	cd backend && .venv/bin/alembic current

db-check:               ## fails unless the target is at the code's migration (Heroku's release phase)
	cd backend && .venv/bin/python -m scripts.check_migrations
