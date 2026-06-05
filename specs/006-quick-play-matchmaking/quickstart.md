# Quickstart — Quick Play (006)

Additiv über 004/005. Voraussetzungen unverändert: Node 20, laufendes **Redis** und **PostgreSQL**
(siehe `docker-compose.yml`), Workspace-Install.

## 1. Infrastruktur & Start

```bash
# Repo-Root
docker compose up -d            # Redis (6380) + Postgres
npm install                     # Workspace

# Server (NestJS + Socket.IO) — neuer Env-Wert optional:
#   MATCHMAKING_TIMEOUT_MS (Default 120000)
npm run --workspace @schiffe/server dev

# Web (Next.js)
npm run --workspace @schiffe/web dev
# → http://localhost:3000/online
```

## 2. 2-Spieler-Quick-Play-Smoke (manuell)

1. In **zwei** Browsern/Profilen je einen **eingeloggten** Account anmelden (Quick Play ist für Gäste
   gesperrt).
2. Beide öffnen `/online` und klicken **„Match suchen"**.
3. Erwartung: Beide sehen kurz „suche Gegner …", werden in **< 2 s** gepaart (SC-001) und landen **ohne
   Code-Eingabe** gemeinsam in der **Schiffsplatzierung** (`placing`).
4. Ab hier identisch zur Code-Lobby: Aufstellung bestätigen → Partie → Schüsse → `game:over`. Statistik
   wird für beide (eingeloggt) geschrieben.

### Abbrechen (FR-008)
- Allein „Match suchen", dann **„Abbrechen"** → Suche endet, kein Match. Erneut suchen möglich.

### Gast gesperrt (FR-001)
- Als Gast existiert **kein** „Match suchen"-Einstieg; ein direkter `queue:join` würde serverseitig mit
  `forbidden` abgelehnt. PvP per Lobby-Code bleibt für Gäste verfügbar.

### Wartetimeout (FR-016)
- Allein suchen und 120 s warten → „kein Match gefunden"; der Eintrag ist aus der Queue entfernt.

## 3. Tests

```bash
# Reine Logik (ohne Infra) — TDD
npm run --workspace @schiffe/server test -- queue-guard quick-play-settings

# Integration (braucht REDIS_URL + DATABASE_URL; sonst via HAS_INFRA übersprungen)
DATABASE_URL=... REDIS_URL=... \
  npm run --workspace @schiffe/server test -- quick-play

# Web-Komponenten (FakeSocket)
npm run --workspace @schiffe/web test -- QuickPlayPanel
```

Abgedeckte Integrationsfälle (Nutzervorgabe):
1. **only-logged-in** — Gast → `forbidden`, keine Queue-Mitgliedschaft.
2. **atomic-no-double-match** — `Promise.all` zweier `queue:join`: genau **ein** Match, beide auf
   demselben `code`, kein dritter Queue-Eintrag (FR-012/SC-006).
3. **leave-on-disconnect** — einreihen, trennen → Queue leer; kein Match, kein `Match`/`Stat` (FR-013/SC-009).
4. **identical-to-code-lobby** — gematchte Partie zu Ende spielen + Persistenz/Stats wie `online-game.test.ts`;
   Reconnect mit dem `queue:matched`-Token (FR-007).

## 4. Verifikations-Checkliste (Spec-Mapping)

| Prüfung | FR / SC |
|---------|---------|
| Zwei Sucher < 2 s gepaart, in `placing`, ohne Code | FR-003/006, SC-001/002 |
| Standard-Einstellungen (touch/30s/extra-turn) | FR-005, SC-003 |
| Gast abgelehnt, kein Warteplatz | FR-001, SC-004 |
| Abbruch < 1 s, keine spätere Paarung | FR-008/009, SC-005 |
| Gleichzeitige Sucher: kein Doppel-/Selbst-Match | FR-011/012, SC-006 |
| In-Partie/offene-Lobby → `already-in-game` | FR-015, SC-007 |
| 120-s-Timeout → „kein Match gefunden" | FR-016, SC-008 |
| Disconnect beim Warten: still, kein Stat | FR-013, SC-009 |
| Partie identisch zur Code-Lobby (Timer/Reconnect/Stats) | FR-007 |
```
