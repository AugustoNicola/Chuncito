release: cd backend && python -m scripts.check_migrations
web: cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
