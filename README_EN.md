# ResumeAI — Intelligent Resume Analysis & Optimization Platform

[中文 README](README.md)

> An LLM-powered resume evaluation system supporting **Job Seeker Mode** (1 resume vs N JDs) and **Recruiter Mode** (1 JD vs N resumes). Built-in user authentication, data isolation, and BYOK (Bring Your Own Key) LLM configuration.

## Features

- 🔐 **User Authentication**: JWT + bcrypt, register/login support, fully isolated data
- 🤖 **AI Deep Analysis**: LLM evaluates resume-job fit, provides actionable improvement suggestions
- 📝 **Structured Editor**: Section-based card editing with JSON Resume schema, one-click AI suggestion application
- 📈 **Batch Scoring**: Recruiter mode supports concurrent analysis of multiple resumes with real-time SSE progress
- 💾 **Template Export**: 6 JSON Resume themes + Playwright PDF export (A4 / smart single-page)
- 🔧 **Custom LLM (BYOK)**: Supports OpenAI / Claude / Ollama and any OpenAI-compatible API, per-user configuration

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Tailwind CSS + Vite |
| Backend | FastAPI + SQLAlchemy 2.0 (async) + Alembic |
| AI Engine | OpenAI / Claude / Ollama (unified LLM Provider interface) |
| Data | SQLite (dev) / PostgreSQL (production-ready) |
| Export | Playwright headless Chrome → PDF |

## Quick Start

> **Just want a quick demo?** Jump to [🐳 Docker Deployment](#-docker-deployment-one-command-start) below and skip Python/Node setup.

### Prerequisites

- Python 3.11+
- Node.js 20+
- Conda (recommended) or venv

### 1. Clone & Start Backend

```bash
cd backend
conda create -n resume_ai python=3.11
conda activate resume_ai
pip install -r requirements.txt
pip install -r requirements-dev.txt  # optional: pytest etc.

# Initialize database
alembic upgrade head

# Start server
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173/`.

### 3. Configure LLM (Required on first use)

Go to Settings page `/settings`:
- **OpenAI**: Enter API Key, select model (gpt-4o / gpt-4o-mini)
- **Ollama**: Enter local address `http://localhost:11434`, select downloaded model
- **Custom**: Any OpenAI-compatible API

## 🐳 Docker Deployment (One-Command Start)

> **Best for**: demos / interviews / evaluators / anyone who wants to see it running fast. No Python/Node setup needed, just [Docker Desktop](https://www.docker.com/products/docker-desktop/) with docker compose v2.24+.

### Quick Start

```bash
git clone <repo>
cd resume_assistance
docker compose up -d --build
```

First build takes **3-5 minutes** (pull images + install deps), subsequent starts take **~30 seconds**. Then open `http://localhost`, go to Settings to enter your LLM API key (BYOK mode).

Image sizes:
- `resumeai-backend` ~3GB (includes Playwright + Chromium for PDF export)
- `resumeai-frontend` ~63MB (nginx:alpine + Vite-built SPA)

### Pre-configuration (Optional — for unattended deployment)

To skip the "enter key in UI" step, pre-configure via env file:

```bash
cp .env.prod.example .env.prod
# Edit .env.prod, set LLM_API_KEY and SECRET_KEY
docker compose up -d --build
```

Every field in `.env.prod.example` is commented with examples (Moonshot / OpenAI / DeepSeek / Ollama). UI-configured keys take **priority** over env (stored encrypted in SQLite).

### Common Operations

```bash
docker compose ps                       # container status
docker compose logs -f backend          # tail backend logs
docker compose logs -f frontend         # tail nginx logs
docker compose down                     # stop (keep data)
docker compose down -v                  # ⚠️ stop + wipe data volume
docker compose up -d --build            # restart / apply updates
git pull && docker compose up -d --build  # pull + rebuild + restart
```

### Port Conflict

If port 80 is taken, edit `docker-compose.yml`:

```yaml
frontend:
  ports:
    - "8080:80"   # change left side (host port), keep right side 80
```

Then visit `http://localhost:8080`.

### Slow Docker Hub in China

Add registry mirrors in Docker Desktop → **Settings → Docker Engine**:

```json
{
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://dockerproxy.com",
    "https://docker.nju.edu.cn"
  ]
}
```

### Architecture

```
┌─────────────────────────────────────────────────┐
│                  Browser                         │
│              http://localhost                    │
└────────────────────┬────────────────────────────┘
                     │
                     ▼  port 80
┌─────────────────────────────────────────────────┐
│  frontend (nginx:alpine)                        │
│  - Static serve /usr/share/nginx/html           │
│  - Reverse proxy /api/* → http://backend:8000   │
│  - SSE long-polling support                     │
└────────────────────┬────────────────────────────┘
                     │  docker network: resumeai_net
                     ▼  service-name DNS: backend
┌─────────────────────────────────────────────────┐
│  backend (FastAPI + Playwright)                 │
│  - uvicorn :8000 (not exposed to host)          │
│  - Auto-runs alembic upgrade head on startup    │
│  - Reads/writes /app/data (named volume)        │
└────────────────────┬────────────────────────────┘
                     │
                     ▼
            ┌─────────────────┐
            │ resumeai_data   │  ← named volume (persistent)
            │  /app/data/     │
            │   ├── *.db      │  SQLite database
            │   └── uploads/  │  Uploaded resumes
            └─────────────────┘
```

**Key Design Decisions**:
- Backend `:8000` is **not exposed externally**, only reachable inside docker network → all external requests go through nginx reverse proxy
- DB + uploads stored in named volume `resumeai_data` → `docker compose down` preserves data; `docker compose down -v` wipes it
- `depends_on: condition: service_healthy` → frontend waits for backend healthcheck (alembic done) before starting, avoiding 502 windows

## Dual-Mode Architecture

```
┌─────────────┐     ┌─────────────┐
│  Seeker     │     │  Recruiter  │
│  /seeker/*  │     │ /recruiter/*│
└──────┬──────┘     └──────┬──────┘
       │                   │
       └─────────┬─────────┘
                 │
         ┌───────┴───────┐
         │  Analysis     │  ← many-to-many
         │  (resume vs job)│
         └───────┬───────┘
                 │
       ┌─────────┴─────────┐
       │   LLM Provider    │
       │  (switchable)     │
       └───────────────────┘
```

### Job Seeker Flow

1. Upload resume (PDF / DOCX / TXT)
2. Editor auto-parses to structured JSON Resume
3. Select target job description (manual entry or link scraping)
4. AI analysis → view score, strengths, weaknesses, suggestions
5. Return to editor with suggestions → one-click apply AI rewrites
6. Preview template → Export PDF

### Recruiter Flow

1. Enter job description
2. Batch upload resumes (up to 50)
3. Background concurrent scoring, real-time SSE progress
4. Leaderboard view rankings, export CSV

## Project Structure

```
backend/
  app/
    routers/          # API routes (auth, jobs, resumes, analyze, config)
    models/           # SQLAlchemy ORM (7 tables: users, resumes, jobs...)
    schemas/          # Pydantic validation
    services/         # Core business logic
  alembic/versions/   # Database migrations

frontend/
  src/
    modes/
      seeker/         # Job seeker mode pages
      recruiter/      # Recruiter mode pages
    templates/        # JSON Resume theme library (6 themes)
    shared/           # Common components
    context/          # Global state
```

## User Authentication

Built-in JWT-based authentication. First visit requires registration:

1. Visit `http://localhost/register` to create an account
2. After login, all data (resumes, jobs, analysis records) is automatically isolated
3. Supports BYOK — each user can independently configure their own LLM API Key

## License

MIT License
