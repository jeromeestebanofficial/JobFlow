# JobFlow

JobFlow is a full-stack job application workflow platform that helps you:

- discover jobs from multiple sources
- score and tailor resumes for each role
- track your application pipeline
- use a Chrome extension to auto-fill application forms

It includes a FastAPI backend, a React frontend, and a Chrome extension package.

## Stack

- **Backend:** FastAPI, SQLAlchemy, SQLite (default), Pydantic, JWT auth
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Zustand
- **Automation/Docs:** Playwright, ReportLab PDF generation
- **Extension:** Chrome Manifest V3 extension for form auto-fill

## Repository Structure

```text
JobFlow/
├── backend/                               # FastAPI API + services + models
│   ├── app/
│   │   ├── routers/                       # Auth, jobs, applications, auto-apply, extension APIs
│   │   ├── services/                      # Scraping, tailoring, PDF generation, auto-apply logic
│   │   ├── models/                        # SQLAlchemy models
│   │   └── schemas/                       # Pydantic schemas
│   ├── .env.example
│   ├── requirements.txt
│   └── run.py
├── frontend/                              # React app
│   ├── src/
│   │   ├── pages/                         # Dashboard, jobs, resume, applications, settings, admin
│   │   ├── api/                           # API client and endpoints
│   │   ├── components/
│   │   └── store/
│   ├── package.json
│   └── vite.config.ts
└── Job Filling Chrome Extension/
    └── JobFormFiller/                     # Chrome extension source
```

## Features

- JWT auth with refresh tokens
- Resume/profile editor
- Job aggregation and discovery
- Match scoring (keyword + AI-assisted options)
- AI resume tailoring and cover letter generation
- Swipe-style and list-based job interaction
- Application tracking and status pipeline
- Auto-apply controls (limits, delays, score threshold)
- Admin-managed document templates
- Chrome extension for assisted auto-fill and resume PDF upload support

## Prerequisites

- **Python:** 3.10+
- **Node.js:** 18+ (or 20+ recommended)
- **npm:** comes with Node.js
- **Chrome:** for the extension workflow

## Quick Start

### 1) Backend Setup

From repository root:

```bash
cd backend
python -m venv venv
```

Activate virtualenv:

- **Windows (PowerShell):**

```powershell
.\venv\Scripts\Activate.ps1
```

- **macOS/Linux:**

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create environment file:

- **Windows (PowerShell):**

```powershell
Copy-Item .env.example .env
```

- **macOS/Linux:**

```bash
cp .env.example .env
```

Run backend:

```bash
python run.py
```

Backend endpoints:

- API root: `http://localhost:8001/`
- Swagger docs: `http://localhost:8001/docs`
- OpenAPI JSON: `http://localhost:8001/openapi.json`

### 2) Frontend Setup

In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on: `http://localhost:5173`

The Vite dev server proxies `/api/*` to `http://localhost:8001`, so frontend API calls work locally without extra env setup.

## Configuration

Backend config lives in `backend/.env`. Start from `backend/.env.example`.

| Variable | Required | Description |
|---|---|---|
| `APP_NAME` | No | Service name shown in API metadata |
| `DEBUG` | No | Enables verbose server error payloads |
| `SECRET_KEY` | Yes | App secret for security-sensitive operations |
| `JWT_SECRET` | Yes | JWT signing secret |
| `DATABASE_URL` | No | DB connection string (`sqlite:///./jobflow.db` default) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Access token lifetime |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | Refresh token lifetime |
| `REDIS_URL` | Optional | External cache backend (falls back if unset) |
| `ENCRYPTION_KEY` | Optional | 32-byte base64 key for encrypting stored API keys |
| `RAPIDAPI_KEY` | Optional | Required only if using RapidAPI LinkedIn source |
| `RAPIDAPI_HOST` | No | RapidAPI host |
| `RAPIDAPI_LINKEDIN_PATH` | No | RapidAPI path |
| `JOB_REFRESH_INTERVAL_HOURS` | No | Job refresh cadence |
| `MAX_APPLICATIONS_PER_DAY` | No | Auto-apply daily limit |
| `MIN_DELAY_SECONDS` | No | Minimum auto-apply delay |
| `MAX_DELAY_SECONDS` | No | Maximum auto-apply delay |
| `CORS_ORIGINS` | No | Comma-separated allowed frontend origins |
| `ADMIN_EMAILS` | Optional | Comma-separated emails granted admin access |

## Running in Development

Run backend and frontend concurrently:

1. Start backend on `:8001`
2. Start frontend on `:5173`
3. Open `http://localhost:5173`
4. Register/login and begin using dashboard, jobs, resume, and applications flows

## Chrome Extension (JobFormFiller)

The extension source is in:

- `Job Filling Chrome Extension/JobFormFiller`

### Install Unpacked Extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `Job Filling Chrome Extension/JobFormFiller`

### Extension Requirements

- Backend running at `http://localhost:8001`
- User signed in through extension popup
- A tailored draft already created for the target job URL

### Download Zip Endpoint

Backend also exposes:

- `GET /api/v1/extension/download`  
  Returns a zip file of the extension package.

## API Surface (High-Level)

Routers are mounted under `/api/v1` and include:

- `auth` (register/login/refresh)
- `users` (profile and account endpoints)
- `resumes` (resume/profile data)
- `jobs` (job ingestion/search/matching)
- `applications` (application pipeline)
- `auto_apply` (automation workflows)
- `document_templates` and `admin_document_templates`
- `extension` (matching, resume PDF, extension download)

Explore full request/response schemas at `http://localhost:8001/docs`.

## Build for Production

Frontend production build:

```bash
cd frontend
npm run build
```

Preview frontend build:

```bash
npm run preview
```

Backend production hardening checklist:

- set strong `SECRET_KEY` and `JWT_SECRET`
- set `DEBUG=false`
- move from SQLite to managed Postgres
- configure reverse proxy and HTTPS
- configure persistent cache if needed (`REDIS_URL`)

## Troubleshooting

- **Frontend can’t reach API**
  - confirm backend is running on `http://localhost:8001`
  - confirm frontend is running via Vite (`npm run dev`)
- **401 errors after login**
  - clear local storage and log in again
  - verify `JWT_SECRET` consistency
- **Extension says no match found**
  - tailor and save a resume draft for that exact job first
  - confirm you are logged into the extension
- **CORS errors**
  - ensure `CORS_ORIGINS` includes `http://localhost:5173`
- **PDF generation issues**
  - ensure `reportlab` is installed in backend virtualenv

## Security Notes

- Do not commit `backend/.env`
- Use long, random secrets in production
- Rotate API keys and JWT secrets when compromised
- Review extension permissions before publishing/distributing

## Community and Collaboration

- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`
- Code of conduct: `CODE_OF_CONDUCT.md`
- PR template: `.github/PULL_REQUEST_TEMPLATE.md`
- Issue templates: `.github/ISSUE_TEMPLATE/`

## Current Limitations

- No CI/CD or deployment manifests included yet
- Default database is local SQLite
- No formal test suite documented in this repository snapshot

## License

This project is licensed under the MIT License. See `LICENSE`.
