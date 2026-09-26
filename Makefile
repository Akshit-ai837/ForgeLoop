.PHONY: setup run test clean eval help

SHELL := /bin/bash

# Default port configuration
PORT ?= 4000

help:
	@echo "ForgeLoop Autonomous AI Coding Harness"
	@echo "======================================"
	@echo "Available commands:"
	@echo "  make setup   - Install dependencies, build client, initialize database"
	@echo "  make run     - Start ForgeLoop server (serves API & UI on http://localhost:$(PORT))"
	@echo "  make test    - Run safe isolated evaluation test suite (never touches demo repos)"
	@echo "  make eval    - Run a task via headless CLI (e.g. make eval TASK=\"...\" REPO=\"products-api\")"
	@echo "  make clean   - Clean temporary build and cache artifacts"

setup:
	@echo "==> Setting up ForgeLoop environment..."
	npm install --no-audit --no-fund
	npm --prefix server install --no-audit --no-fund
	npm --prefix client install --no-audit --no-fund
	@echo "==> Building web interface..."
	npm --prefix client run build
	@echo "==> Initializing SQLite database schema..."
	node -e 'import("./server/db/database.js").then(() => console.log("Database ready."))'
	@echo "==> Setup complete!"

run:
	@echo "==> Starting ForgeLoop on port $(PORT)..."
	@echo "    Access Web UI / API at: http://localhost:$(PORT)"
	@if [ -n "$$AI_API_KEY" ]; then \
		echo "    AI_API_KEY detected in environment."; \
	else \
		echo "    NOTE: AI_API_KEY not set. Export AI_API_KEY=\"<key>\" before running autonomous tasks."; \
	fi
	PORT=$(PORT) node server/server.js

test:
	@echo "==> Running safe evaluation test suite (isolated fixtures)..."
	npm --prefix server test

eval:
	@if [ -z "$(TASK)" ]; then \
		echo "Error: TASK parameter required. Example: make eval TASK=\"Fix auth bug\" [REPO=my-repo]"; \
		exit 1; \
	fi
	node server/cli.js --task "$(TASK)" $(if $(REPO),--repo "$(REPO)",)

clean:
	@echo "==> Cleaning temporary artifacts..."
	rm -rf client/dist
	rm -f forgeloop.db-shm forgeloop.db-wal
	@echo "==> Clean complete."
