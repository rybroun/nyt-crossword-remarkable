.PHONY: install dev build test serve clean

# Full setup — Python + frontend
install:
	python3 -m venv .venv
	.venv/bin/pip install -e ".[dev,server]"
	cd frontend && npm install

# Start both dev servers (frontend hot reload + backend API)
dev:
	@echo "Starting backend on :8742 and frontend on :5173..."
	@.venv/bin/nyt-crossword-remarkable serve & \
	cd frontend && npm run dev

# Build frontend into the Python package
build:
	cd frontend && npm run build

# Run Python tests
test:
	.venv/bin/pytest -v

# Start production server (serves built frontend)
serve:
	.venv/bin/nyt-crossword-remarkable serve

# Remove build artifacts
clean:
	rm -rf src/nyt_crossword_remarkable/frontend/dist
	rm -rf frontend/node_modules
	rm -rf .venv
	rm -rf __pycache__ .pytest_cache *.egg-info
