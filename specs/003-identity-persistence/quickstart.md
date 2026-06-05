# Quickstart: Identität und Persistenz (lokal)

Lokales Hochfahren von Postgres, Server (`packages/server`) und Frontend (`packages/web`) sowie
ein manueller Smoke-Flow zur Verifikation der Akzeptanzkriterien. Voraussetzung: Node 20, npm,
Docker (für Postgres).

> Diese Anleitung beschreibt den **Zielzustand** nach Umsetzung der Tasks. Vor der Implementierung
> existieren `packages/server`, `docker-compose.yml` etc. noch nicht.

## 1. Abhängigkeiten installieren

```bash
npm ci          # installiert alle Workspaces (engine, web, server)
```

## 2. Postgres starten (Docker Compose)

```bash
docker compose up -d        # startet den Dienst `postgres` (Port 5432, benanntes Volume)
docker compose ps           # Status prüfen
```

## 3. Server-Env anlegen

```bash
cp packages/server/.env.example packages/server/.env
# Mindestens setzen:
#   DATABASE_URL=postgresql://schiffe:schiffe@localhost:5433/schiffe?schema=public
#   COOKIE_SECRET=<zufälliger Wert>
#   GUEST_TOKEN_SECRET=<zufälliger Wert>
#   PORT=3001
#   WEB_ORIGIN=http://localhost:3000
```

## 4. Datenbankschema migrieren & Client generieren

```bash
npm run --workspace packages/server prisma:deploy     # committete Migrationen anwenden
npm run --workspace packages/server prisma:generate   # Prisma Client

# Schemaänderungen während der Entwicklung erzeugen eine neue Migration:
#   npm run --workspace packages/server prisma:migrate -- --name <beschreibung>
```

## 5. Server & Web starten

```bash
# Terminal A — API
npm run --workspace packages/server dev      # NestJS auf http://localhost:3001

# Terminal B — Frontend (proxyt /api/* → :3001, Same-Origin-Cookies)
npm run --workspace packages/web dev         # Next.js auf http://localhost:3000
```

Frontend öffnen: <http://localhost:3000>.

## 6. Smoke-Flow (manuell, deckt Akzeptanzszenarien ab)

1. **Registrieren (US1-1, SC-001)**: Konto mit E-Mail + Passwort (≥ 8 Zeichen) + Anzeigename
   anlegen → eingeloggt, Profil mit Anzeigename sichtbar.
2. **Passwortregel (SC-009)**: Registrierung mit 7-Zeichen-Passwort → wird mit `400` abgelehnt;
   ein 8-Zeichen-Passwort ohne Sonderzeichen wird akzeptiert.
3. **Doppelte E-Mail (US1-2)**: gleiche E-Mail erneut → `409`.
4. **Session-Restore (US1-5, SC-010)**: Browser-Tab schließen und erneut öffnen → weiterhin
   angemeldet (`GET /me` ⇒ `user`).
5. **Falsches Passwort (US1-4, FR-008)**: Logout, dann Login mit falschem Passwort → `401`
   „ungültige Zugangsdaten" (keine Aussage, ob E-Mail existiert).
6. **KI-Partie + Statistik (US2-1/2, SC-002)**: eine Partie gegen die KI zu Ende spielen →
   `gamesPlayed +1`, `wins` **oder** `losses` +1, `winRate` konsistent neu berechnet (Profil).
7. **Idempotenz (US2-6, SC-006)**: dieselbe beendete Partie erneut melden (z. B. Reload während
   der Meldung) → Statistik ändert sich **nicht** erneut.
8. **Persistenz über Anmeldung (US2-4, SC-004)**: Logout → Login → Statistik unverändert
   vorhanden.
9. **Leeres Profil (US2-5, SC-003)**: frisches Konto → `gamesPlayed=0, wins=0, losses=0,
   winRate=0 %` ohne Division-durch-null-Fehler.
10. **Gast (US3-1/3, SC-005)**: ausloggen, als Gast mit temporärem Namen fortfahren, KI-Partie
    beenden → **keine** gespeicherte Statistik; `GET /me/stats` ⇒ `403`.
11. **Gast nicht wiederherstellbar (US3-4)**: Gast-Cookie löschen / Ablauf → Identität weg.
12. **Capability-Gating (US4-2/3/4, SC-007)**: als Gast `GET /me/profile` → `403`; als
    eingeloggt → `200`.

## 7. Tests ausführen

```bash
# Reine Domänenlogik (kein DB nötig): Passwort-Wrapper, winRate, Identität
npm run --workspace packages/server test -- unit

# Integration (braucht laufende Test-Postgres + migrate): Auth-Flows, Stats-Schreibpfad,
# Idempotenz, Capability-Gating, Session-Restore
npm run --workspace packages/server test -- integration

# Gesamtes Monorepo-Quality-Gate (wie CI)
npm run lint && npm run typecheck && npm run test && npm run build
```

## 8. Aufräumen

```bash
docker compose down          # Postgres stoppen (Volume bleibt erhalten)
docker compose down -v       # zusätzlich Daten-Volume entfernen (frischer Zustand)
```

## Troubleshooting

- **Cookies kommen nicht an**: sicherstellen, dass das Web über den `/api`-Rewrite-Proxy zugreift
  (Same-Origin) und der Client `credentials:'include'` sendet.
- **`prisma migrate` schlägt fehl**: läuft Postgres? `DATABASE_URL` korrekt? `docker compose ps`.
- **Decorator-/DI-Fehler in Vitest**: `reflect-metadata`-Import im Test-Setup + `unplugin-swc`
  aktiv (siehe research.md §11).
