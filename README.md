# FloorPlan Pro - Production Deployment

This repository contains a server that processes CAD plans using Autodesk APS and a pipeline (analyze → ilot → corridor → export). The project includes APS webhook support and a webhook store (SQLite with a JSON fallback).

This README describes how to run a production-ready setup using Docker (recommended) and alternative Windows-based steps.

## Required environment variables

- APS_CLIENT_ID and APS_CLIENT_SECRET — Autodesk APS credentials
- APS_WEBHOOK_SECRET — secret used to verify APS webhook HMAC signatures (HMAC-SHA256 preferred)
- ADMIN_API_KEY — (recommended) protect admin routes for webhook lifecycle management
- MASTER_KEY — (recommended) 32-byte key (hex or base64) to encrypt webhook secrets at rest

Example MASTER_KEY generation (Linux/macOS):

```
# 32 bytes hex
openssl rand -hex 32

# or base64
openssl rand -base64 32
```

## Run with Docker (recommended for production)

1. Build and run:

```bash
docker-compose build --no-cache
docker-compose up -d
```

2. Verify:

```bash
curl http://localhost:3001/health
```

3. Register APS webhooks using the provided admin API (ensure `ADMIN_API_KEY` is set):

POST /api/aps/webhooks/register with JSON { callbackUrl, system, event, scope }

The server persists webhook metadata in `webhooks.db` (SQLite). If `better-sqlite3` cannot be installed, the server falls back to `webhooks.json`.

## Windows: installing better-sqlite3

Installing `better-sqlite3` on Windows requires Visual Studio Build Tools and a compatible Windows SDK. If you prefer to avoid native builds, run the server inside Docker as above.

If you want to install locally on Windows, follow Microsoft's Visual Studio Build Tools installer and ensure the Windows SDK version in the npm error is installed.

## Security notes

- Keep `MASTER_KEY` and `ADMIN_API_KEY` secret. Use a proper secrets store in production (Key Vault, Secrets Manager, etc.).
- Always run with TLS (reverse proxy or load balancer terminating TLS) in production.

## Deploying to Render.com

This project includes a sample `render.yaml` and a `Dockerfile` to deploy to Render's Cloud Native services. Two common approaches:

- Native Node build (Render will install deps and run start command) — recommended for quick setups.
- Docker image (the included `Dockerfile`) — recommended to control runtime precisely.

To deploy using `render.yaml`:

1. Create a new GitHub repository and push this code (you can use `scripts\create_and_push_repo.ps1` if you have the GitHub CLI `gh` installed).
2. In Render, connect your GitHub repo and import `render.yaml` when creating a new service.
3. Set environment variables in Render's dashboard: `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `APS_WEBHOOK_SECRET`, `ADMIN_API_KEY`, `MASTER_KEY`.
4. Make sure `PORT` is set to `3001` (the default the app listens on).

To deploy using Docker on Render:

1. Push your repo to GitHub.
2. Create a new Web Service in Render and select the Docker deployment option.
3. Render will build the image using the included `Dockerfile` and run `node server.js`.

Notes:
- The app binds to 127.0.0.1 by default for local-only operation. On Render,you should set `BIND_ADDRESS` env var to `0.0.0.0` or adjust startup if necessary. Example: `BIND_ADDRESS=0.0.0.0`.
- For APS webhooks, Render services are publicly reachable and can receive webhook callbacks directly. Use a strong `APS_WEBHOOK_SECRET` and verify signatures.


# FloorPlan Pro Clean

**A completely clean, working FloorPlan Pro system with no conflicts or freezing.**

## Features

✅ Real CAD file processing  
✅ Intelligent îlot placement  
✅ Corridor network generation  

# FloorPlan Pro - Production Deployment

This repository contains a server that processes CAD plans using Autodesk APS and a pipeline (analyze → ilot → corridor → export). The project includes APS webhook support and a webhook store (SQLite with a JSON fallback).

This README describes how to run a production-ready setup using Docker (recommended) and alternative Windows-based steps.

## Required environment variables

- APS_CLIENT_ID and APS_CLIENT_SECRET — Autodesk APS credentials
- APS_WEBHOOK_SECRET — secret used to verify APS webhook HMAC signatures (HMAC-SHA256 preferred)
- ADMIN_API_KEY — (recommended) protect admin routes for webhook lifecycle management
- MASTER_KEY — (recommended) 32-byte key (hex or base64) to encrypt webhook secrets at rest

Example MASTER_KEY generation (Linux/macOS):

```bash
# 32 bytes hex
openssl rand -hex 32

# or base64
openssl rand -base64 32
```

## Run with Docker (recommended for production)

1. Build and run:

```bash
docker-compose build --no-cache
docker-compose up -d
```

2. Verify:

```bash
curl http://localhost:3001/health
```

3. Register APS webhooks using the provided admin API (ensure `ADMIN_API_KEY` is set):

POST /api/aps/webhooks/register with JSON { callbackUrl, system, event, scope }

The server persists webhook metadata in `webhooks.db` (SQLite). If `better-sqlite3` cannot be installed, the server falls back to `webhooks.json`.

## Windows: installing better-sqlite3

Installing `better-sqlite3` on Windows requires Visual Studio Build Tools and a compatible Windows SDK. If you prefer to avoid native builds, run the server inside Docker as above.

If you want to install locally on Windows, follow Microsoft's Visual Studio Build Tools installer and ensure the Windows SDK version in the npm error is installed.

## Security notes

- Keep `MASTER_KEY` and `ADMIN_API_KEY` secret. Use a proper secrets store in production (Key Vault, Secrets Manager, etc.).
- Always run with TLS (reverse proxy or load balancer terminating TLS) in production.

---

# FloorPlan Pro Clean

**A completely clean, working FloorPlan Pro system with no conflicts or freezing.**

## Features

- ✅ Real CAD file processing
- ✅ Intelligent îlot placement
- ✅ Corridor network generation
- ✅ Interactive canvas with pan/zoom
- ✅ No freezing, no conflicts
- ✅ Clean, modern UI

## Quick Start (development)

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open browser:

<http://localhost:3001>

4. Upload a DXF/DWG file and generate îlots!

## How It Works

- **Upload**: Processes CAD files and detects rooms
- **Generate Îlots**: Creates intelligent workspace placement
- **Generate Corridors**: Builds circulation networks
- **Interactive Canvas**: Pan, zoom, and explore your layout

---
