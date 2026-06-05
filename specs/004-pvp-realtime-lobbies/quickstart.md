# Quickstart — PvP-Lobbys & Echtzeit-Online-Partie (lokal)

Ziel: lokal eine Echtzeit-PvP-Partie zwischen zwei Browser-Tabs spielen. Baut auf der M2-Umgebung
auf (Postgres) und ergänzt **Redis**.

## Voraussetzungen

- Node 20, npm, Docker (für Postgres + Redis).
- Repo-Root: `/…/Schiffe`. Workspaces: `packages/{engine,server,web}`.

## 1. Infrastruktur starten (Postgres + Redis)

`docker-compose.yml` (Repo-Root) enthält jetzt **Postgres** (Host-Port 5433) und **Redis**
(Host-Port 6380):

```bash
docker compose up -d         # startet postgres + redis
docker compose ps            # beide „healthy"?
```

## 2. Server konfigurieren

```bash
cd packages/server
cp .env.example .env         # falls noch nicht vorhanden
```
`.env` enthält zusätzlich zur M2-Konfiguration:
```ini
# Redis (Docker Compose, Host-Port 6380 vermeidet Konflikt mit lokalem Redis auf 6379)
REDIS_URL=redis://localhost:6380

# Zug-Timer Defaults / Limits (optional; Defaults im Code)
TURN_TIMER_DEFAULT_SECONDS=30
MAX_OPEN_LOBBIES_PER_USER=5
JOIN_RATE_LIMIT_WINDOW_SECONDS=60
JOIN_RATE_LIMIT_MAX_FAILS=10
```

## 3. Datenbank migrieren (neue Modelle Match/MatchMove)

```bash
# im Repo-Root oder packages/server
npm --workspace @schiffe/server run prisma:generate
npm --workspace @schiffe/server run prisma:migrate   # erzeugt Migration für Match/MatchMove
```

## 4. Server & Web starten

```bash
# Terminal A — API + WebSocket-Gateway (Port 3001)
npm --workspace @schiffe/server run dev

# Terminal B — Web (Port 3000, Dev-Rewrite-Proxy für Same-Origin-Cookies/WS)
npm --workspace @schiffe/web run dev
```

## 5. Smoke-Flow: eine Online-Partie zu zweit

1. **Tab 1 (eingeloggt)**: registrieren/einloggen → Online → **Lobby erstellen** mit Einstellungen
   (Berührung, Timer z. B. 30 s, Extrazug an). Ein **Lobby-Code** erscheint (z. B. `7K3-Q9X`).
2. **Tab 2 (Gast)**: Online → **Beitreten** mit Code + Gast-Anzeigename. → Lobby wechselt zu
   `placing`; beide sehen den Status des jeweils anderen (verbunden).
3. **Beide Tabs**: Flotte platzieren → bestätigen. Sind beide platziert → Status `in_progress`,
   Startspieler ist Seat A (Host). Der Countdown läuft beim Spieler am Zug.
4. **Schießen**: Spieler am Zug klickt ein Feld → beide Tabs sehen `Wasser/Treffer/versenkt` als
   Live-Update. Bei Treffer (Extrazug an) bleibt der Schütze am Zug, Timer startet neu; bei Wasser
   wechselt der Zug.
5. **Spielende**: Sind alle Schiffe eines Spielers versenkt → `game:over` mit Sieger. Die Statistik
   des **eingeloggten** Spielers ist aktualisiert (Tab 1 Profil); der Gast (Tab 2) erhält keinen
   Eintrag.

## 6. Verhalten an den Rändern (manuell prüfbar)

- **Timer-Ablauf**: nichts tun, bis der Countdown 0 erreicht → Zug verfällt (kein Schuss), Gegner
  ist dran (FR-021).
- **Disconnect im Spiel**: einen Tab schließen während `in_progress` → der andere Tab erhält
  `game:over` (`forfeit`), Ergebnis wird gewertet (FR-010a).
- **Pre-Game-Leave**: zweiter Spieler verlässt in `placing` → Lobby zurück zu `waiting`; Host
  verlässt → Lobby schließt (FR-011a).
- **Doppelschuss/Re-Send**: identische `moveId` zweimal → zählt einmal (FR-017).

## 7. Tests

```bash
# alle Pakete
npm test

# nur Server (Unit + socket.io-client-Integration; Redis via ioredis-mock by default,
# echtes Redis wenn REDIS_URL gesetzt ist)
npm --workspace @schiffe/server test
```
Kern-Suites: Zugvalidierung · **Fog-of-War-Leak (kein gegnerisches Schiff in irgendeinem Event)** ·
Timer-Ablauf · Idempotenz · Lobby-Lebenszyklus · Persistenz/Stats-Naht.

## Stop / Reset

```bash
docker compose down          # stoppt postgres + redis
docker compose down -v       # + Volumes löschen (DB/Redis-Reset)
```
