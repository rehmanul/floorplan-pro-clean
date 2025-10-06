# Deploying FloorPlan Pro Clean to Render or Docker

This repository contains a minimal Dockerfile and a Render service manifest to deploy the FloorPlan Pro Clean server.

Essential environment variables (set as Render secrets or Docker envs):

- APS_CLIENT_ID - Autodesk APS client id
- APS_CLIENT_SECRET - Autodesk APS client secret
- APS_WEBHOOK_SECRET - Shared secret for verifying APS webhooks (optional for local dev but required in production)
- ADMIN_API_KEY - Optional admin API key for protecting admin endpoints
- MASTER_KEY - 32-byte key (hex or base64) used to encrypt webhook secrets (recommended in production)

Quick Render deploy steps:

1. Push your branch to GitHub.
2. Create a new Web Service on Render and connect the repo and choose the Dockerfile option.
3. Add the environment variables and secrets in the Render console.
4. Set the service port to 3000 (the Dockerfile sets PORT=3000 by default).
5. Deploy.

Notes:

- The app expects to run in production (NODE_ENV=production). The server will exit if required environment variables for APS are missing when NODE_ENV=production.

- SQLite and optional native packages: If you use better-sqlite3, make sure the Render build environment provides build tools, or use the optional `sql.js` fallback.
- For hosted previews, the frontend reads the API base from `window.__API_BASE__` (defaults to window.location.origin) so the app should work when served behind Render.
