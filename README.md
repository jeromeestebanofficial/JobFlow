# JobFlow

JobFlow is a full-stack job application workflow platform built around one goal: help users find roles, tailor resumes, and execute applications faster with better quality.

This repository contains:

- a FastAPI backend (`backend/`)
- a React + Vite frontend (`frontend/`)
- a Chrome extension for form assist (`Job Filling Chrome Extension/JobFormFiller/`)

## What JobFlow Does

- Aggregates jobs (including LinkedIn sync flow) into a local job pipeline
- Provides match scoring and AI-assisted tailoring for resume/cover letter content
- Tracks applications and statuses in one dashboard
- Supports semi-automated apply flows with guardrails and delays
- Exposes extension APIs so a Chrome extension can fetch matched resume data and assist form filling
- Supports document templates and admin template management

## Tech Stack

- **Backend:** FastAPI, SQLAlchemy, Pydantic Settings, JWT auth, SQLite (default)
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **Automation + AI tooling:** Playwright, ReportLab, OpenAI/Anthropic-compatible integrations
- **Extension:** Chrome Manifest V3

## Repository Layout

```text
JobFlow/
├── backend/
│   ├── app/
│   │   ├── config.py                   # Environment-driven app settings
│   │   ├── main.py                     # FastAPI app + router registration
│   │   ├── database.py                 # DB bootstrap/init
│   │   ├── models/                     # SQLAlchemy models
│   │   ├── routers/                    # API route groups mounted under /api/v1
│   │   ├── schemas/                    # Pydantic request/response models
│   │   ├── services/                   # Scraping, matching, tailoring, auto-apply logic
│   │   └── utils/                      # Security + shared helpers
│   ├── .env.example
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── src/
│   │   ├── api/                        # HTTP clients and endpoint wrappers
│   │   ├── components/                 # Reusable UI/features
│   │   ├── pages/                      # App screens/routes
│   │   ├── store/                      # Zustand stores
│   │   └── types/                      # Shared TS types
│   ├── package.json
│   └── vite.config.ts
└── Job Filling Chrome Extension/
    └── JobFormFiller/
        ├── manifest.json
        ├── popup.html / popup.js
        ├── background.js
        └── content.js
```

## Core API Modules

All backend routers are mounted under `/api/v1`:

- `/auth` - register, login, token refresh
- `/users` - profile preferences and API key management
- `/resumes` - resume CRUD
- `/jobs` - job listing, swipe feed, sync/reset actions, match endpoint
- `/applications` - application CRUD, tailor/export, experiments
- `/auto-apply` - credentials, questionnaires, apply actions, task status
- `/document-templates` - user template read endpoints
- `/admin/document-templates` - admin template management
- `/extension` - extension download, match, resume PDF, guardrails

Interactive docs: `http://localhost:8001/docs`

## Prerequisites

- Python 3.10+
- Node.js 18+ (20+ recommended)
- npm
- Google Chrome (for extension development/testing)

## Local Development Setup

### 1) Backend

From repo root:

```bash
cd backend
python -m venv venv
```

Activate virtual environment:

- **Windows PowerShell**
```powershell
.\venv\Scripts\Activate.ps1
```

- **macOS/Linux**
```bash
source venv/bin/activate
```

Install backend dependencies:

```bash
pip install -r requirements.txt
```

Create local environment file:

- **Windows PowerShell**
```powershell
Copy-Item .env.example .env
```

- **macOS/Linux**
```bash
cp .env.example .env
```

Run backend:

```bash
python run.py
```

Backend default endpoints:

- API root: `http://localhost:8001/`
- Health: `http://localhost:8001/health`
- OpenAPI docs: `http://localhost:8001/docs`

Note: `backend/run.py` currently runs with `reload=False`. For live reload in development, run uvicorn directly:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### 2) Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:5173`

The Vite dev server proxies `/api/*` requests to `http://localhost:8001`.

## Environment Configuration

Primary backend configuration is in `backend/.env` (start from `.env.example`).

| Variable | Required | Purpose |
|---|---|---|
| `APP_NAME` | No | FastAPI service title |
| `DEBUG` | No | Shows detailed 500 traces in API responses when true |
| `SECRET_KEY` | Yes | App-level cryptographic secret |
| `JWT_SECRET` | Yes | JWT signing secret |
| `DATABASE_URL` | No | Database URL (`sqlite:///./jobflow.db` by default) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Access token expiration |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Refresh token expiration |
| `REDIS_URL` | Optional | External cache backend |
| `ENCRYPTION_KEY` | Optional | Key for stored provider/API key encryption |
| `RAPIDAPI_KEY` | Optional | Needed for RapidAPI-based LinkedIn ingestion |
| `RAPIDAPI_HOST` | No | RapidAPI host override |
| `RAPIDAPI_LINKEDIN_PATH` | No | RapidAPI endpoint path |
| `JOB_REFRESH_INTERVAL_HOURS` | No | Job refresh cadence |
| `MAX_APPLICATIONS_PER_DAY` | No | Auto-apply rate limit |
| `MIN_DELAY_SECONDS` | No | Auto-apply minimum delay |
| `MAX_DELAY_SECONDS` | No | Auto-apply maximum delay |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `ADMIN_EMAILS` | Optional | Comma-separated admin bootstrap emails |

## Chrome Extension Setup

Extension path: `Job Filling Chrome Extension/JobFormFiller`

Load unpacked extension:

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select the `JobFormFiller` folder

Expected local permissions/hosts are defined in `manifest.json`, including `http://localhost:8001/*`.

The backend also exposes a packaged download endpoint:

- `GET /api/v1/extension/download`

## Build Commands

Frontend production build:

```bash
cd frontend
npm run build
```

Preview frontend build:

```bash
npm run preview
```

## Troubleshooting

- **Frontend cannot reach API**
  - Ensure backend is running on `http://localhost:8001`
  - Ensure frontend runs with `npm run dev` on `http://localhost:5173`
- **Auth/token issues**
  - Re-login and verify `JWT_SECRET` consistency
  - If needed, clear browser local storage/session data
- **Extension match not found**
  - Confirm the job has a saved tailored draft
  - Confirm extension popup session is authenticated
- **CORS errors**
  - Add frontend URL to `CORS_ORIGINS` in `backend/.env`
- **PDF export/generation failures**
  - Verify backend dependencies installed from `requirements.txt` (includes `reportlab`)

## Security Notes

- Never commit `backend/.env`
- Use strong random `SECRET_KEY` and `JWT_SECRET` in non-local environments
- Rotate keys if leaked
- Review extension permissions before sharing or publishing

## Contributing and Governance

- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- Pull request template: `.github/PULL_REQUEST_TEMPLATE.md`
- Issue templates: `.github/ISSUE_TEMPLATE/`

## License

MIT License. See `LICENSE`.
