# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NBA Statistics Database — a full-stack application for storing and analyzing NBA player/team statistics across 5 seasons (2019-20 through 2023-24).

**Stack:** PostgreSQL 15 · Redis 7 · Python 3.11 · FastAPI · SQLAlchemy 2.0 · asyncpg · React 18 · TypeScript · Recharts · Docker Compose

**Current state:** Only `PLAN.MD` exists. All implementation is guided by that file — read it before starting any phase.

## Implementation Plan

`PLAN.MD` is the single source of truth. It is written in Russian and contains 13 numbered phases (Фаз 0–12), each broken into sub-prompts to execute **strictly in order** (each phase depends on the previous).

Phases overview:
- **Фаз 0** — Project structure + Docker Compose + `.env.example`
- **Фаз 1** — DB schema (`db/01_schema.sql`): 8 tables with constraints and Russian comments
- **Фаз 2** — Indexes (`db/02_indexes.sql`): 16 indexes including covering and partial indexes
- **Фаз 3** — Roles (`db/03_roles.sql`): `db_admin`, `analyst`, `reader`
- **Фаз 4** — SQL functions (`db/04_functions.sql`): TS%, eFG%, USG%, PER, BPM calculations
- **Фаз 5** — Triggers (`db/05_triggers.sql`): auto-recalculate `player_season_stats` on insert/update
- **Фаз 6** — Views (`db/06_views.sql`): rankings, standings, leaderboards
- **Фаз 7** — Data loading script (`scripts/load_data.py`): CSV → PostgreSQL via psycopg2
- **Фаз 8** — FastAPI backend (`backend/app/`): 25+ endpoints, async, Redis caching
- **Фаз 9** — Backend tests: pytest + httpx, real DB (no mocks)
- **Фаз 10** — React frontend (`frontend/src/`): Dashboard, Players, Teams, Leaderboards, Standings
- **Фаз 11** — Frontend tests: Jest + React Testing Library
- **Фаз 12** — Production hardening: connection pooling, query optimization, Docker production configs

## Commands

Once implemented, the primary workflow is Docker Compose:

```bash
docker-compose up          # Start all services (postgres, redis, backend, frontend)
docker-compose up -d       # Detached mode
docker-compose logs -f     # Follow logs
```

Services:
- PostgreSQL 15: `localhost:5432` (db: `nba_stats`, user: `nba_admin`)
- Redis 7: `localhost:6379`
- FastAPI backend: `http://localhost:8000`
- React frontend: `http://localhost:3000`

Backend (once created):
```bash
cd backend && uvicorn app.main:app --reload   # Dev server
pytest tests/                                  # Run all tests
pytest tests/test_players.py                   # Single test file
```

Frontend (once created):
```bash
cd frontend && npm start     # Dev server
npm test                     # Run tests
npm run build                # Production build
```

## Architecture

### Database Layer
- **`db/01_schema.sql`** — 8 tables. Key table is `game_player_stats` (~200K rows of per-game stats). `player_season_stats` (~3K rows) holds pre-aggregated averages and advanced metrics. All SQL comments in Russian.
- **`db/04_functions.sql`** — Pure SQL functions for advanced metrics: PER (league avg = 15), BPM, TS%, eFG%, USG%
- **`db/05_triggers.sql`** — Triggers on `game_player_stats` INSERT/UPDATE auto-recalculate `player_season_stats`
- **`db/06_views.sql`** — Read-only views for leaderboards, standings, rankings (used by `analyst`/`reader` roles)
- SQL scripts in `db/` are auto-executed by PostgreSQL in filename order (01→06) via `docker-entrypoint-initdb.d`

### Backend Layer (`backend/app/`)
- `main.py` — FastAPI app entrypoint
- `database.py` — asyncpg connection pool
- `cache.py` — Redis client for query result caching
- `models/` — SQLAlchemy ORM models
- `schemas/` — Pydantic request/response schemas
- `routers/` — Route handlers (players, teams, games, stats, leaderboards)
- `services/` — Business logic, metric calculations

### Frontend Layer (`frontend/src/`)
- `pages/` — Dashboard, Players, Teams, Leaderboards, Standings
- `components/` — Reusable widgets and chart components (Recharts)
- Player photos: `https://cdn.nba.com/headshots/nba/latest/1040x760/{nba_id}.png`
- Team logos: `https://cdn.nba.com/logos/nba/{nba_team_id}/global/L/logo.svg`

## Key Constraints

- All SQL must be **idempotent** (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)
- All SQL comments in **Russian** via `COMMENT ON TABLE/COLUMN`
- Backend tests use a **real database** — no mocking the DB layer
- `game_player_stats` has a `UNIQUE(game_id, player_id)` constraint and integrity checks (e.g., `fgm <= fga`, `fg3m <= fgm`)
- Three DB roles with distinct permissions: `db_admin` (full CRUD+DDL), `analyst` (read + execute functions), `reader` (views only)
