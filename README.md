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
2. Start backend (headless, works on Linux without screen):
   npm run start:web
3. Open in browser:
   http://localhost:3000

Additional backend modes:
- `npm run start:web:p2p`
- `npm run start:web:relay`
- `npm run start:web:raw` (uses current `NETWORK_MODE` env or defaults to `server`)

Windows-only legacy launcher with predefined TLS/TURN env:
- `npm run start:web:ps1`

## Experimental P2P Network Mode
This branch also contains an experimental backend transport mode that keeps the current runtime/UI
but replaces central room discovery/history transport with:
- `hyperswarm` for discovery and peer connections
- `b4a` for topic/key encoding
- `autobase` + `hyperbee` for shared message/voice-channel history

Run it with:
- `npm run start:web:p2p`
- optional bootstrap override:
  - PowerShell: `$env:P2P_BOOTSTRAP="88.99.3.86@node1.hyperdht.org:49737,142.93.90.113@node2.hyperdht.org:49737,138.68.147.8@node3.hyperdht.org:49737"`
  - packaged exe arg: `qwerbentum.exe --p2p-bootstrap=88.99.3.86@node1.hyperdht.org:49737,142.93.90.113@node2.hyperdht.org:49737,138.68.147.8@node3.hyperdht.org:49737`

Current scope of P2P mode:
- room discovery between independent backend nodes
- signal relay for WebRTC signaling
- shared text history / shared voice channel definitions

Current limitations of P2P mode:
- file attachments are rejected in P2P mode for now
- it is still experimental and should be treated as a feature branch
- media still depends on WebRTC/NAT conditions and may still require TURN
- pure P2P discovery requires UDP reachability; in strict CGNAT/symmetric NAT cases peers may never connect without relay infrastructure

P2P diagnostics endpoint:
- `GET /api/p2p/status`
- returns local peer id, active bootstrap source, connected peer counts, and room-level peer state

## Run Desktop (Electron)
1. Install dependencies:
   npm install
2. Start desktop app:
   npm start

Default Electron backend URL:
- `http://owa.mine-souls.ru:3001`
- this URL is used automatically if no `--backend-url=...` and no remote backend env override are provided.

With current defaults Electron connects to the shared backend above.
To use a different backend, pass CLI arg or env override.

Remote backend mode:
- PowerShell:
  - `$env:QWERBENTUM_REMOTE_URL="https://voice.example.com"`
  - `npm start`
- Or pass CLI arg:
  - `npm start -- --backend-url=https://voice.example.com`

In packaged `.exe` mode:
- `qwerbentum.exe --backend-url=https://voice.example.com`

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

## Linux: Certbot + HTTPS on port 3001
For headless Linux server you can request cert and run HTTPS backend in one command:

```bash
cd ~/MyVoicer
EMAIL=admin@mine-souls.ru NETWORK_MODE=server npm run cert:linux:https
```

What it does:
- gets/renews Let's Encrypt certificate via `certbot --standalone` (uses port 80 for HTTP challenge)
- default domain is `owa.mine-souls.ru` (override with `DOMAIN=...`)
- syncs certs into repository path `certs/letsencrypt/export/<domain>/`
- starts backend with:
  - `HOST=0.0.0.0`
  - `PORT=3001`
  - `SSL_CERT_PATH` and `SSL_KEY_PATH` from repo export path if available, otherwise from `/etc/letsencrypt/live/<domain>/`

Related commands:
- issue/renew cert only: `EMAIL=admin@mine-souls.ru npm run cert:linux:issue`
- start HTTPS with existing cert only: `NETWORK_MODE=server npm run start:web:https:3001`

## Internet desktop topology
For two PCs in different networks:
1. Run one shared web/backend server on a public IP or domain.
2. Enable HTTPS on that server.
3. Point both Electron apps to that same backend via `QWERBENTUM_REMOTE_URL` or `--backend-url=...`.
4. Keep TURN reachable from the Internet.

## Important limitations
- This is an MVP, not full Discord clone.
- Host machine quality and bandwidth affect the whole voice room.
- No persistence/auth/history yet.
- For strict NAT/mobile networks, TURN is required.
