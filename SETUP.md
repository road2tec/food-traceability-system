# Setup on a new laptop (Windows, PowerShell)

## 1. Install prerequisites (once)
- Git: https://git-scm.com/download/win
- Node.js 20 or newer (tested on 24): https://nodejs.org
- Python 3.10 or newer: https://www.python.org/downloads/ (tick "Add to PATH")
- MongoDB Community 7.x: https://www.mongodb.com/try/download/community
  (install as a Windows service so it runs on `127.0.0.1:27017`)

Check:
```powershell
node -v; npm -v; python --version; git --version
Get-Service MongoDB        # Status should be Running
```

## 2. Clone
```powershell
git clone https://github.com/road2tec/food-traceability-system.git
cd food-traceability-system
```

## 3. Server (API, port 4000)
```powershell
cd server
npm install
copy .env.example .env
notepad .env
```
In `.env` set (example dev values, change them if you like):
```
JWT_SECRET=any-long-random-string-at-least-32-chars
SEED_ADMIN_PASSWORD=Admin@12345
SEED_DEMO_PASSWORD=Demo@12345
```
Passwords need 10+ characters with a letter and a digit. Then:
```powershell
npm run seed        # creates admin + demo users + demo product types
cd ..
```

## 4. AI service (port 8001)
```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

## 5. Client (port 5173)
```powershell
cd client
npm install
cd ..
```

## 6. Run (open 3 PowerShell windows, from the repo root)
Window 1 - AI service:
```powershell
cd ai-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8001
```
Window 2 - API:
```powershell
cd server
npm start
```
Window 3 - Web app:
```powershell
cd client
npm run dev -- --host localhost --port 5173
```

Open **http://localhost:5173** (use `localhost`, not `127.0.0.1`).
API docs: http://localhost:4000/api-docs. Health: http://localhost:4000/api/v1/health (server, mongo and ai should all be UP).

## 7. Demo logins
Password = the value you put in `.env` (`SEED_ADMIN_PASSWORD` for admin, `SEED_DEMO_PASSWORD` for the others).
`admin@example.test`, `producer@example.test`, `distributor@example.test`, `warehouse@example.test`, `retailer@example.test`

## 8. Try the full flow
1. Log in as `producer@example.test`, register a batch.
2. Add a checkpoint (temperature, humidity, location).
3. Download the QR code; open `http://localhost:5173/verify/<batchId>` (public page, no login).
4. Propose a custody transfer to the distributor; log in as the distributor and accept it.
5. Use the simulator button to generate demo checkpoints.

## 9. Tests
```powershell
cd server;     npm test                                              # 44 tests
cd ai-service; .\.venv\Scripts\python.exe -m pytest -q               # 61 tests
cd client;     npm test                                              # 37 tests
cd tests-e2e;  npm install
$env:E2E_ADMIN_EMAIL='admin@example.test'; $env:E2E_ADMIN_PASSWORD='Admin@12345'
node run.mjs                                                         # 29 end-to-end steps (API + AI + Mongo must be running)
```
Restart the API between e2e runs (the rate-limit test locks logins until restart).

## 10. Troubleshooting
- `ai: DOWN` in health: AI service window not running or still starting; wait 10 s.
- Login 429: restart the API (`npm start`).
- Browser CORS errors: you opened `127.0.0.1`; use `localhost`.
- Mongo connection refused: start the service: `Start-Service MongoDB` (admin PowerShell).
- Port in use: `Get-NetTCPConnection -LocalPort 4000,5173,8001`.
- More in `docs/TROUBLESHOOTING.md`.

Blockchain is out of scope; integrity is a local SHA-256 hash check. Freshness values use demonstration parameters and are not validated food-safety advice.
