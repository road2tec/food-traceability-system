# Troubleshooting

Logs for processes started by `start-all`: `infrastructure/.run/<name>.out.log` and `<name>.err.log` (`ai-service`, `server`, `client`).

| Symptom | Cause | Fix |
|---|---|---|
| `EADDRINUSE` / "port already in use" (4000, 5173, 8001) | previous run or other app | `netstat -ano \| findstr :4000` then `taskkill /PID <pid> /T /F`; or `stop-all.ps1`. Stale `.run/*.pid` files are ignored when the process is gone |
| `MongoDB is not listening on 27017`, `ECONNREFUSED 127.0.0.1:27017`, `MongooseServerSelectionError` | mongod stopped | `net start MongoDB` (admin shell) or start `mongod --dbpath <dir>`. Use `127.0.0.1`, not `localhost` (IPv6 `::1` can fail) |
| `running scripts is disabled on this system` | PowerShell execution policy | `powershell -ExecutionPolicy Bypass -File .\infrastructure\scripts\setup.ps1` or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`; or use the `.sh` scripts in Git Bash |
| `py -3.10` not found / `python` opens Microsoft Store | Python not on PATH | Install Python 3.10, tick "Add to PATH", disable the Store alias (Settings > App execution aliases) |
| venv missing / `No module named uvicorn` | setup not run or pip failed | delete `ai-service/.venv`, re-run `setup.ps1`; check network/proxy; use the venv interpreter explicitly: `ai-service\.venv\Scripts\python -m pip install -r requirements.txt` |
| `pip` wheel build errors (numpy/scikit-learn) | wrong Python version | use Python 3.10 (3.12+ may lack pinned wheels) |
| `uvicorn` "Could not import module app.main" | wrong working dir or entry point | run from `ai-service/`; start script uses `app.main:app` (falls back to `main:app`) |
| Browser: "blocked by CORS policy" | client origin not allowed by server | origin must be `http://localhost:5173` (or the configured `CLIENT_ORIGIN`/`PUBLIC_BASE_URL`); `127.0.0.1:5173` vs `localhost:5173` are different origins. Check `VITE_API_URL` in `.env` |
| Client calls hit the wrong API | `VITE_API_URL` is baked in at build/dev start | edit `.env`, restart `npm run dev` / rebuild the Docker client image |
| Predictions show `PENDING_REVIEW` / `UPSTREAM_UNAVAILABLE` | ai-service not running | start it; `http://127.0.0.1:8001/health`; check `AI_SERVICE_URL` |
| Login returns `429 RATE_LIMITED` | login rate limiter (also triggered deliberately by e2e step S99) | wait for the window to expire or restart the server |
| e2e: admin login fails | seed not run or different seeded credentials | `infrastructure\scripts\seed.ps1`; set `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` |
| e2e: `checkpoint missing in MongoDB collection "checkpoints"` | e2e `MONGODB_URI` differs from the server's DB | export the same `MONGODB_URI` for both |
| e2e W19 fails "hash deviates from contract" | server hashing differs from `docs/API_CONTRACT.md` | genuine finding: align `server` hashing with the contract |
| Database in a bad state | stale dev data | `reset-dev.ps1 -Force -Reseed` (drops only `food_traceability`, local URI only) |
| `docker compose` errors | compose is UNTESTED | check `.env` exists; `docker compose config` to validate; server must reach `mongo` / `ai-service` by service name (compose overrides `MONGODB_URI`, `AI_SERVICE_URL`) |
| Jest "setupFiles ... not found" in server | test env file missing | belongs to the server component; see its README |
| npm `ci` fails: lockfile out of sync | package.json changed | run `npm install` in that directory |
| Long path / OneDrive locks on Windows | deep `node_modules` | keep the repo outside synced folders |
