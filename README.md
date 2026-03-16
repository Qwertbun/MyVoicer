# Peer-Hosted Voice Messenger

MVP voice messenger with server + voice-room host election:
- first user in a voice room becomes host
- host relays voice to all other participants in that voice room
- if host leaves, next participant is promoted automatically
- screen sharing in voice room
- screen sharing with system/tab audio (when browser provides it)
- per-user volume control (0-200%) on each client

## Stack
- Node.js
- Express
- Socket.IO (signaling)
- WebRTC (audio)
- Electron (desktop shell + auto updates)

## Run
1. Install dependencies:
   npm install
2. Start web server:
   npm run start:web
3. Open in browser:
   http://localhost:3000

## Run Desktop (Electron)
1. Install dependencies:
   npm install
2. Start desktop app:
   npm start

Desktop startup order:
1. Start app process
2. Check updates from GitHub repository
3. Show `hexagon-loading` splash screen
4. Open main app (`index.html`) in Electron window

## Auto-update and Release
- Auto-update is configured through `electron-updater` + GitHub Releases.
- Workflow: `.github/workflows/electron-release.yml`
- Release trigger: push git tag `v*` (for example `v1.0.1`) or run workflow manually.
- Build command in CI: `npm run release` (electron-builder publish).
- Local build command: `npm run dist:win` (artifacts are written to timestamped folders in `release/`).

Open multiple tabs (or devices) and join the same server.
For screen audio in Chrome/Edge, enable the browser checkbox like `Share tab audio` / `Share system audio` when starting screen share.

## ICE / Internet config
Server exposes `GET /api/ice-config` and client loads it before join.
Default STUN pool is pre-integrated (curated from the provided gist list), and you can override it via env.
To re-validate the gist list in your environment: `npm run check:stun`
Use [.env.example](./.env.example) as a template for deployment variables.

- Optional STUN override:
  - `$env:STUN_URLS="stun:stun.l.google.com:19302,stun:stun.nextcloud.com:443"`
- TURN for real-world NATs (recommended for production):
  - `$env:TURN_URLS="turn:your-turn-host:3478?transport=udp,turns:your-turn-host:5349"`
  - `$env:TURN_USERNAME="your_user"`
  - `$env:TURN_PASSWORD="your_password"`
- Force relay-only mode (through TURN):
  - `$env:ICE_TRANSPORT_POLICY="relay"`

## LAN / 2nd PC microphone fix
Browsers usually block microphone on `http://<LAN-IP>:<port>`.
Use HTTPS for remote devices.

1. Create certs (example filenames):
   - `certs/dev-key.pem`
   - `certs/dev-cert.pem`
2. Start server with TLS:
   - PowerShell:
     - `$env:PORT="3001"`
     - `$env:SSL_KEY_PATH="certs/dev-key.pem"`
     - `$env:SSL_CERT_PATH="certs/dev-cert.pem"`
     - `npm start`
3. On second PC open:
   - `https://<SERVER_LAN_IP>:3001`
4. Trust the certificate on that PC (for self-signed certs), then join server.

## Let's Encrypt (public domain)
For real Internet use, issue a trusted certificate for your domain.
Requirements:
- domain DNS `A/AAAA` record points to your server
- inbound TCP `80` is open during certificate issue/renew
- Docker **or** WSL with `certbot` is available

Issue certificate:
- PowerShell:
  - `npm run cert:issue:le -- -Domain voice.example.com -Email you@example.com`
  - force WSL mode: `npm run cert:issue:le -- -Domain voice.example.com -Email you@example.com -UseWsl`
  - test mode (no rate limits): `npm run cert:issue:le -- -Domain voice.example.com -Email you@example.com -Staging`

Run app with issued cert:
- PowerShell:
  - `$env:PORT="443"`
  - `$env:SSL_KEY_PATH="certs/letsencrypt/export/voice.example.com/privkey.pem"`
  - `$env:SSL_CERT_PATH="certs/letsencrypt/export/voice.example.com/fullchain.pem"`
  - `npm start`

Renew certificates:
- `npm run cert:renew:le`
- force WSL mode: `npm run cert:renew:le -- -UseWsl`

Note: scripts export Windows-readable PEM files to `certs/letsencrypt/export/<domain>/`.

## Important limitations
- This is an MVP, not full Discord clone.
- Host machine quality and bandwidth affect the whole voice room.
- No persistence/auth/history yet.
- For strict NAT/mobile networks, TURN is required.
