# SASH Ocean developer shortcuts.
.PHONY: init up down logs ps reseed analytics test test-backend test-edge lint frontend-dev backend-dev

init:            ## generate .env with random secrets and print demo logins
	./scripts/init-env.sh

up:              ## build and start the full stack
	docker compose up -d --build

down:            ## stop the stack (keeps data volumes)
	docker compose down

logs:
	docker compose logs -f --tail=100 api worker web

ps:
	docker compose ps

reseed:          ## regenerate the synthetic demonstration world
	docker compose exec worker python -m app.cli seed-demo --force

analytics:       ## run detection, risk scoring and alerting now
	docker compose exec worker python -m app.cli run-analytics

test: test-backend test-edge

test-backend:    ## needs a PostGIS server: TEST_DATABASE_URL=postgresql+psycopg://user:pw@host:port/postgres
	cd backend && pytest

test-edge:
	cd edge && PYTHONPATH=. pytest -q

lint:
	cd backend && ruff check app tests
	cd frontend && npm run typecheck

backend-dev:     ## run the API locally against DATABASE_URL (hot reload)
	cd backend && uvicorn app.main:app --reload --port 8000

frontend-dev:    ## Vite dev server on :5173 proxying /v1 to :8000
	cd frontend && npm run dev
