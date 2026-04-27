# Contributing to JobFlow

Thanks for your interest in contributing.

## Development Setup

1. Fork and clone the repository.
2. Create a feature branch from `master`.
3. Set up backend:
   - `cd backend`
   - `python -m venv venv`
   - Activate the venv
   - `pip install -r requirements.txt`
   - Copy `.env.example` to `.env`
4. Set up frontend:
   - `cd frontend`
   - `npm install`

## Branch and Commit Conventions

- Use small, focused branches per change.
- Use clear commit messages:
  - `feat: add X`
  - `fix: resolve Y`
  - `docs: update Z`
- Keep PRs reviewable and scoped.

## Pull Request Checklist

- [ ] Code builds and runs locally.
- [ ] Changes are documented in `README.md` when behavior changes.
- [ ] No secrets are committed (`.env`, API keys, tokens).
- [ ] Generated artifacts are not committed (`dist`, `venv`, PDFs).
- [ ] PR description explains why the change is needed.

## Code Style

- Backend: follow PEP 8 and type hints where practical.
- Frontend: prefer typed props and explicit return types for exported functions.
- Keep modules cohesive and avoid cross-layer coupling.
- Prefer readability over cleverness.

## Reporting Issues

Please include:

- What happened
- Expected behavior
- Steps to reproduce
- Environment details (OS, Python/Node versions)
