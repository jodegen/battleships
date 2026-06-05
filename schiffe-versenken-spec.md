# Schiffe versenken – Projektspezifikation

> Browserbasiertes Echtzeit-Multiplayer-Spiel
> Stand: Juni 2026 · Version 0.1 (Entwurf)

---

## 1. Überblick

Ein im Browser spielbares "Schiffe versenken" mit zwei Hauptmodi: gegen eine KI (drei Schwierigkeitsgrade) und gegen andere Menschen in Echtzeit (online). Eingeloggte Nutzer erhalten Statistiken und können Lobbys eröffnen; Gäste können per Lobby-Code beitreten, ohne sich zu registrieren.

### Kernziele

- **Niedrige Einstiegshürde:** Mitspielen als Gast ohne Account.
- **Echtzeit-Erlebnis:** Live-Updates der Züge, Verbindungsstatus, "Gegner ist am Zug".
- **Verlässlichkeit:** Reconnect nach Verbindungsabbruch, kein Spielzustandsverlust.
- **Fairness:** Server ist die einzige Wahrheit (server-authoritative), kein Cheating durch manipulierten Client.

---

## 2. Spielmodi

### 2.1 Spieler vs. KI

Drei Schwierigkeitsgrade, die sich rein in der Ziel-Strategie der KI unterscheiden:

| Stufe | Strategie | Verhalten |
|-------|-----------|-----------|
| **Leicht** | Zufall | Schießt auf zufällige, noch nicht beschossene Felder. Kein "Nachsetzen" nach Treffern. |
| **Mittel** | Hunt & Target | Schießt zufällig (Hunt), bis ein Treffer erfolgt; danach gezielt auf die vier angrenzenden Felder (Target), bis das Schiff versenkt ist. |
| **Schwer** | Wahrscheinlichkeits­dichte + Parität | Berechnet für jedes Feld, in wie vielen möglichen Positionen der noch lebenden Schiffe es liegen könnte, und schießt auf das wahrscheinlichste Feld. Nutzt im Hunt-Modus ein Schachbrettmuster (Parität), da das kleinste Schiff jedes zweite Feld abdeckt. |

> Die KI läuft serverseitig (oder bei reinem Offline-Modus optional im Client), damit dieselbe Spiel-Engine wie im PvP genutzt wird.

### 2.2 Spieler vs. Spieler (online)

- Echtzeit über WebSockets.
- Eine Lobby = ein privater Raum für genau zwei Spieler (+ optional Zuschauer).
- Live-Statusanzeige: verbunden / am Zug / Schiffe platziert / disconnected.
- Reconnect-Fenster (z. B. 60 s), in dem ein abgebrochener Spieler zurückkehren kann; danach gilt die Partie als aufgegeben.

---

## 3. Benutzer & Zugang

### 3.1 Nutzertypen

| Typ | Lobby erstellen | Lobby beitreten (Code) | Quick Play | Statistiken | Persistenz |
|-----|:---:|:---:|:---:|:---:|:---:|
| **Eingeloggter Spieler** | ✅ | ✅ | ✅ | ✅ | dauerhaft |
| **Gast** | ❌ | ✅ | ❌ | ❌ | nur Session |

### 3.2 Regeln

- Nur **eingeloggte Spieler** können Lobbys erstellen.
- **Gäste** treten über einen **Lobby-Code** (z. B. 6-stellig, gut lesbar wie `7K3-Q9X`) bei.
- Gäste wählen einen temporären Anzeigenamen; ihr Zustand existiert nur für die Dauer der Session.
- Eingeloggte Spieler bekommen ihre Ergebnisse in die Statistik geschrieben – auch dann, wenn der Gegner ein Gast war.

### 3.3 Authentifizierung

- E-Mail + Passwort sowie optional OAuth (Google/GitHub) für schnelle Registrierung.
- Session über HTTP-only Cookies oder JWT.
- Gast-Identität über ein kurzlebiges Session-Token (kein Account-Eintrag in der DB nötig).

---

## 4. Lobby- & Matchmaking-System

### 4.1 Lobby-Lebenszyklus

1. Eingeloggter Spieler erstellt Lobby → System generiert eindeutigen Code.
2. Lobby-Status: `waiting` → `placing` (Schiffe setzen) → `in_progress` → `finished`.
3. Zweiter Spieler (eingeloggt oder Gast) tritt per Code bei.
4. Beide platzieren Schiffe → Partie startet.
5. Inaktive Lobbys werden nach Timeout (z. B. 10 min ohne Beitritt) automatisch geschlossen.

### 4.2 Quick Play (öffentliches Matchmaking) – v1

- **Nur für eingeloggte Spieler.** Gäste spielen PvP ausschließlich per Lobby-Code.
- Warteschlange, in der zwei suchende Spieler automatisch gepaart werden.
- Erzeugt intern eine Lobby mit Standard-Einstellungen (kein Code nötig).
- Später erweiterbar um ELO-basiertes Matchmaking (ähnliches Niveau).

---

## 5. Spielregeln & -mechanik

### 5.1 Standardvariante

- Spielfeld **10×10**.
- Schiffsflotte (klassisch):
  - 1× Schlachtschiff (5)
  - 1× Kreuzer (4)
  - 2× Zerstörer (3)
  - 1× U-Boot (3)
  - 1× Boot (2)
  > (Konfigurierbar – siehe Varianten.)
- Schiffe nur horizontal/vertikal, dürfen sich nicht überlappen.
- **Berührung von Schiffen ist erlaubt** (Standard). Per Lobby-Einstellung beim Erstellen kann das Berühren **deaktiviert** werden (dann müssen Schiffe mindestens ein Feld Abstand haben).
- **Treffer = Extrazug:** Wer trifft, darf erneut schießen. Der Zug wechselt erst beim ersten Fehlschuss ("miss").
- **Zug-Timer:** Pro Zug gilt ein Zeitlimit (siehe Abschnitt 10). Läuft die Zeit ab, **verfällt der Zug** und der Gegner ist an der Reihe (kein automatischer Schuss).
- Gewonnen hat, wer zuerst alle gegnerischen Schiffe versenkt.

### 5.2 Server-autoritative Validierung

Der Server prüft jeden Zug:
- Ist der Spieler am Zug?
- Wurde das Feld noch nicht beschossen?
- Liegt das Feld im Spielfeld?
- Schiffsplatzierung gültig (Anzahl, Größe, keine Überlappung)?
- Berührungsregel der Lobby eingehalten (falls Berührung deaktiviert: Mindestabstand)?
- Bei Treffer: bleibt derselbe Spieler am Zug (Extrazug-Regel)?

Der Client zeigt nur an – die Spiellogik entscheidet ausschließlich der Server.

---

## 6. Features – Umfang & Priorisierung

### 6.1 Bestätigt für v1 (Kern)

Diese Features sind fest eingeplant:

- **Reconnect-Handling** – Spieler kann nach Verbindungsabbruch innerhalb eines Zeitfensters in die laufende Partie zurückkehren (Details Abschnitt 10).
- **Mobile-/Touch-optimiertes UI** – responsives Layout, Touch-Bedienung für Schiffsplatzierung (Tippen/Ziehen, Drehen) und Schüsse; optional als PWA installierbar.
- **Sounds & Animationen** – Einschlag, Treffer, Versenken, Wasser/Fehlschuss; abschaltbar (Mute-Toggle, Respektierung von "reduced motion").
- **Zug-Timer** – Zeitlimit pro Zug, sichtbarer Countdown, serverseitig durchgesetzt.
- **Rate-Limiting / Anti-Abuse** – Schutz von Lobby-Erstellung, Beitritt und Zug-Events; Filterung von Gast-Namen.
- **Konfigurierbare Lobby-Einstellungen** – u. a. Berührung von Schiffen an/aus (siehe 6.3).

### 6.2 Geplant als spätere Updates

- **Chat** – reicht als spätere Erweiterung. Start als reaktionsarmer **Quick-Chat / Emotes** (vorgefertigte Nachrichten, kaum Moderationsaufwand), Freitext-Chat optional danach.
- **ELO-/Ranking-System** und Bestenliste.
- **Achievements** ("Erster Sieg", "Perfekte Partie ohne Verlust", …).
- **Match-History & Replays** – Partien Zug für Zug nachspielen.
- **Spielvarianten:** andere Feldgrößen (8×8, 12×12), eigene Flotten, "Salvo" (mehrere Schüsse pro Zug).
- **Zuschauer-Modus** für laufende Lobbys.

### 6.3 Lobby-Einstellungen (beim Erstellen wählbar)

| Einstellung | Werte | Standard |
|-------------|-------|----------|
| Berührung von Schiffen | erlaubt / verboten | erlaubt |
| Zug-Timer | z. B. 15 / 30 / 60 s / aus | 30 s |
| Treffer = Extrazug | an / aus | an |
| Feldgröße (später) | 8×8 / 10×10 / 12×12 | 10×10 |
| Zuschauer erlaubt (später) | an / aus | aus |

> Die gewählten Einstellungen werden Teil des Lobby-/Match-Zustands und serverseitig erzwungen.

### 6.4 Weiter hinten / optional
- **Turniere** (Bracket-System).
- **Freundesliste & Rematch-Einladungen.**
- **Tägliche Challenges** gegen feste KI-Setups.
- **Power-ups-Variante** (Radar-Scan, Mehrfachschuss) als eigener Modus.
- **Internationalisierung (i18n)** – DE/EN umschaltbar.

---

## 7. Technologie-Stack (Vorschlag)

Empfehlung: durchgängig **TypeScript**, damit Spiellogik (Engine, Validierung) zwischen Client und Server geteilt werden kann (Monorepo).

### 7.1 Empfohlener Stack

| Bereich | Technologie | Begründung |
|---------|-------------|------------|
| **Frontend** | Next.js (React) + TypeScript | SSR/Routing, großes Ökosystem, gut für Auth-Seiten + Spiel-UI. |
| **Styling** | Tailwind CSS | Schnelles, konsistentes UI. |
| **Client-State** | Zustand (oder React Context) | Leichtgewichtig, gut für Spielzustand. |
| **Realtime** | Socket.IO (Node) | Rooms, Reconnect, Fallbacks out-of-the-box – passt perfekt zu Lobbys. |
| **Backend** | Node.js + NestJS (oder Fastify) | Strukturiert, TypeScript-nativ, gut für REST + WebSocket-Gateway. |
| **Persistente DB** | PostgreSQL + Prisma (ORM) | Nutzer, Stats, Match-History, Replays. |
| **Session-/Live-State** | Redis | Lobby- & Spielzustand, Presence, Reconnect-Tokens, Matchmaking-Queue, Pub/Sub für Skalierung über mehrere Server. |
| **Auth** | Auth.js (NextAuth) oder Lucia | E-Mail + OAuth, Sessions. |
| **Tests** | Vitest/Jest + Playwright | Engine-Unit-Tests + E2E der Spielabläufe. |
| **Hosting** | Frontend: Vercel · Backend+Redis+PG: Railway/Fly.io/Render | Einfacher Start, später skalierbar. |

### 7.2 Realtime-Entscheidung: Socket.IO ✅

**Festgelegt: Socket.IO.** Gründe: ausgereifte Room-Verwaltung (passt 1:1 auf Lobbys), eingebautes Reconnect, automatische Fallbacks und ein Redis-Adapter für Skalierung über mehrere Instanzen. Außerdem reine Standard-Tools, kein zusätzliches Framework.

> Hinweis zur Alternative: Ein Game-Server-Framework wie **Colyseus** bringt Räume/State-Sync/Reconnect noch stärker vorgefertigt mit. Es wird hier bewusst **nicht** verwendet, ist aber dokumentiert, falls später ein Wechsel evaluiert werden soll.

### 7.3 Warum geteilte Spiel-Engine?

Die reine Spiellogik (Schiff-Platzierung prüfen, Schuss auswerten, Sieg erkennen, KI) wird als framework-unabhängiges TypeScript-Paket gebaut. Vorteile:
- Server validiert autoritativ mit derselben Logik.
- Client kann Züge optimistisch vorhersagen / KI offline ausführen.
- Einmal getestet, überall korrekt.

---

## 8. Architektur (grob)

```
+-------------------+         WebSocket          +------------------------+
|   Browser-Client  | <------------------------> |   Realtime-Gateway     |
|  (Next.js/React)  |        (Socket.IO)         |   (NestJS + Socket.IO) |
|                   | --- REST (Auth, Stats) --> |                        |
+-------------------+                            +-----------+------------+
                                                             |
                                          +------------------+------------------+
                                          |                                     |
                                   +------v------+                       +------v------+
                                   |  PostgreSQL |                       |    Redis    |
                                   | (Prisma)    |                       | Live-State, |
                                   | User, Stats,|                       | Lobbys,     |
                                   | History     |                       | Presence,   |
                                   |             |                       | Pub/Sub     |
                                   +-------------+                       +-------------+

         [ geteilte Engine als TS-Paket: Regeln, Validierung, KI ]
```

---

## 9. Datenmodell (Skizze)

**User**
`id, displayName, email, passwordHash, createdAt`

**Stat** (1:1 zu User)
`userId, gamesPlayed, wins, losses, winRate, eloRating, totalShotsFired, hitRate`

**Match**
`id, lobbyCode, playerAId, playerBId (nullable für Gast), mode (pvai|pvp), aiDifficulty (nullable), winnerId, startedAt, endedAt, status`

**MatchMove** (für Replays)
`id, matchId, turnIndex, byPlayer, x, y, result (miss|hit|sunk), createdAt`

**Lobby** (flüchtig, in Redis)
`code, hostUserId, status, players[], boards{}, currentTurn, createdAt`

> Gäste erzeugen keinen `User`-Eintrag; ihre Identität lebt nur als Session-Token + Eintrag in der Redis-Lobby.

---

## 10. Wichtige technische Themen

- **Server-authoritative:** Schiffspositionen des Gegners werden dem Client **nie** gesendet, bis sie getroffen/versenkt sind. (Sonst trivialer Cheat.)
- **Reconnect (Pflicht):** Pro Spieler ein Reconnect-Token. Bei Verbindungsabbruch bleibt der Sitzplatz für ein Reconnect-Fenster (z. B. 60 s) reserviert; der Gegner sieht den Status "Gegner getrennt – wartet (xx s)". Beim Wiederverbinden wird der vollständige Spielzustand aus Redis neu zugestellt. Läuft das Fenster ab, gilt die Partie als aufgegeben. Der Zug-Timer pausiert während eines laufenden Reconnects.
- **Zug-Timer (Pflicht):** Serverseitig gemessenes Zeitlimit pro Zug (Lobby-Einstellung, Standard 30 s). Sichtbarer Countdown beim Client; bei Ablauf entscheidet der Server (Zug verfällt / Wechsel). Wichtig im Zusammenspiel mit der Extrazug-Regel: Der Timer wird bei jedem Treffer für den nächsten Schuss neu gestartet.
- **Idempotenz:** Doppelt gesendete Züge (Lag/Re-Send) dürfen nicht doppelt zählen (z. B. Move-ID pro Zug).
- **Skalierung:** Mehrere Server-Instanzen via Redis-Adapter für Socket.IO (Pub/Sub), damit Spieler im selben Raum landen.
- **Rate-Limiting / Anti-Abuse (Pflicht):**
  - Limit auf Lobby-Erstellung pro Nutzer/Zeit.
  - Limit auf Beitritts-Versuche (gegen Code-Erraten).
  - Limit/Throttle auf Zug- und Chat-Events pro Socket.
  - Validierung & Filterung von Gast-Anzeigenamen (Länge, Schimpfwortfilter).
  - Lobby-Codes ausreichend groß & zufällig wählen, um Erraten zu erschweren.

---

## 11. Roadmap (Vorschlag)

**Meilenstein 1 – Engine & Offline-KI**
Spiel-Engine (Regeln, Validierung), KI in drei Stufen, lokales Spielen gegen KI im Browser, ohne Backend.

**Meilenstein 2 – Auth & Persistenz**
Registrierung/Login, Nutzerprofil, Statistiken gegen die KI werden gespeichert.

**Meilenstein 3 – PvP-Lobbys (Echtzeit)**
WebSocket-Gateway, Lobby per Code, Gast-Beitritt, Echtzeit-Züge, Sieg-/Niederlage-Erfassung.

**Meilenstein 4 – Robustheit**
Reconnect, Timeouts, Zuschauer/Spectator, Match-History.

**Meilenstein 5 – Komfort & Wettbewerb**
ELO/Ranking, Bestenliste, Achievements, Replays, Spielvarianten, PWA.

---

## 12. Entscheidungen & offene Fragen

### Entschieden ✅

- [x] **Berührung von Schiffen:** erlaubt (Standard), pro Lobby deaktivierbar.
- [x] **Treffer = Extrazug:** ja, Standard (per Lobby-Einstellung abschaltbar).
- [x] **Zug-Timer:** verpflichtend, serverseitig erzwungen (Standard 30 s, einstellbar).
- [x] **Realtime:** Socket.IO.
- [x] **Reconnect-Handling:** Pflicht-Feature in v1.
- [x] **Mobile-/Touch:** Pflicht-Feature in v1.
- [x] **Sounds & Animationen:** in v1 (abschaltbar).
- [x] **Rate-Limiting / Anti-Abuse:** Pflicht in v1.
- [x] **Chat:** als spätere Erweiterung, Start mit Quick-Chat/Emotes.

- [x] **Timer-Ablauf:** Zug verfällt, der Gegner ist dran (kein Auto-Schuss).
- [x] **Quick-Play (öffentliches Matchmaking):** in v1 enthalten.

- [x] **Quick-Play-Zugang:** nur für eingeloggte Spieler. Gäste spielen PvP ausschließlich per Lobby-Code.

### Noch offen

- [ ] Konkretes Reconnect-Fenster (60 s?) und Timer-Stufen (15/30/60 s)?
- [ ] Schimpfwortfilter für Gast-Namen: eigene Liste oder Bibliothek?
