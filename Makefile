# Makefile for local development: run, build, lint, format

SHELL := /bin/zsh
NODE_BIN := node
BUN := bun

.PHONY: help install dev build start lint format check-format fix-format clean docker-up docker-down

help:
	@echo "Available targets:"
	@echo "  install       - Install dependencies (incl. dev tools)"
	@echo "  dev           - Start dev server (tsx watch)"
	@echo "  build         - Compile TypeScript"
	@echo "  start         - Run built server"
	@echo "  lint          - Lint TypeScript sources"
	@echo "  format        - Format code with Prettier"
	@echo "  check-format  - Check formatting without writing"
	@echo "  fix-format    - Alias for format"
	@echo "  clean         - Remove build artifacts"
	@echo "  docker-up     - Start services with docker-compose"
	@echo "  docker-down   - Stop services"

install:
	$(BUN) install
	# Dev tooling for linting/formatting
	$(BUN) add -d eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier

dev:
	$(BUN) run dev

build:
	$(BUN) run build

start:
	$(BUN) run start

lint:
	# Prefer project script if present; fallback to bunx eslint
	if $(BUN) run -s lint >/dev/null 2>&1; then \
		$(BUN) run lint; \
	else \
		bunx eslint "src/**/*.ts"; \
	fi

format:
	bunx prettier --write "src/**/*.ts" "*.{js,ts,json,md}" || true

check-format:
	bunx prettier --check "src/**/*.ts" "*.{js,ts,json,md}" || true

fix-format: format

clean:
	rm -rf dist

docker-up:
	docker compose up -d

docker-down:
	docker compose down
