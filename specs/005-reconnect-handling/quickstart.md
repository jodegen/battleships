# Quickstart — Reconnect-Handling (005)

Voraussetzung: Feature 004 läuft lokal (Redis + Postgres via `docker-compose`, Server + Web). Dieses
Feature fügt nur einen additiven Layer hinzu — **keine** neue Infrastruktur, **keine** Prisma-Migration.

## Starten (wie 004)

```bash
docker compose up -d            # Redis + Postgres
npm --workspace packages/server run start:dev
npm --workspace packages/web   run dev
```

Keine neuen `.env`-Pflichtwerte. Optional konfigurierbar (mit Default):
- `RECONNECT_WINDOW_MS=60000` (fix 60 s laut Spec; Default genügt).

## Manueller 2-Spieler-Smoke (Reconnect)

1. **Browser A** (eingeloggt): Lobby erstellen → Code notieren. **Browser B** (eingeloggt oder Gast):
   per Code beitreten. Beide Flotten platzieren → Partie `in_progress`.
2. **Reconnect-Token prüfen**: In beiden Browsern liegt unter `localStorage["schiffe.reconnect"]`
   ein `{ code, token, playerId }`.
3. **Trennung simulieren**: In Browser B den Tab **neu laden** (oder DevTools → Network → Offline
   kurz an/aus). Erwartung in **Browser A**: „Gegner getrennt – wartet (xx s)" mit herunterzählendem
   Countdown; das Brett ist gesperrt (kein Zug möglich), der Zug-Timer steht.
4. **Rückkehr < 60 s**: Browser B verbindet automatisch neu (Auto-`reconnect:resume`). Erwartung:
   B sieht **genau** seinen vorherigen sichtbaren Zustand (eigene Flotte, eigene Schüsse+Ergebnisse,
   Zug-Inhaber, Restzeit); A's Hinweis verschwindet; der Zug-Timer läuft mit der **Restzeit** weiter.
5. **Fog of War prüfen**: Nirgends im wiederhergestellten Zustand erscheinen ungetroffene
   gegnerische Schiffe (nur eigene Treffer/Versenkungen sichtbar).
6. **Ablauf testen**: Erneut trennen und **> 60 s** warten. Erwartung: Partie endet als Aufgabe,
   Browser A wird Sieger; bei eingeloggten Spielern ist die Statistik genau einmal fortgeschrieben.
7. **Verspäteter Reconnect**: Browser B nach Ablauf neu laden → erhält terminales Endergebnis
   („Partie beendet"), **kein** Wiedereintritt.

## Automatisierte Tests

```bash
# Server: Unit (rein, TDD) + Integration (socket.io-client + Test-Redis, now() injiziert)
npm --workspace packages/server test

# Web: Komponententests (FakeSocket)
npm --workspace packages/web test
```

Schlüssel-Testfälle (siehe research.md §9): **Timer-Pause während Trennung**, **State-Restore ohne
Leak gegnerischer Schiffe**, **Aufgabe nach 60 s (genau eine Wertung)**, **beide gleichzeitig
getrennt (erstes Fenster entscheidet)**, plus ungültiges Token und verspäteter Reconnect.

## Definition of Done (Feature)

- Disconnect in `in_progress` → Pause + 60-s-Grace statt Sofort-Forfeit (FR-004/005/006/018).
- `reconnect:resume` stellt sichtbaren Zustand über `viewFor` wieder her, Fog of War gewahrt
  (FR-008/009/020, SC-002).
- Zug-Timer pausiert und läuft mit Restzeit weiter (FR-011–013, SC-004).
- Fenster-Ablauf → Aufgabe, Sieger gesetzt, idempotente Stats über bestehende Modelle
  (FR-014/014a/015/016).
- Token überdauert Reload; Auto-Reconnect + Gegner-Countdown im Web (FR-003/003a/007).
- Alle vier geforderten Testklassen grün; Lint/Format/Build grün (CI-Gate).
