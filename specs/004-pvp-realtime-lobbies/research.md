# Phase 0 — Research & Entscheidungen: PvP-Lobbys & Echtzeit-Online-Partie

Auflösung aller offenen Technologie-/Pattern-Fragen aus der Technical Context. Format je Punkt:
**Decision / Rationale / Alternatives considered**.

---

## 1. Socket.IO innerhalb von NestJS

**Decision**: `@nestjs/websockets` + `@nestjs/platform-socket.io` mit **einem** `@WebSocketGateway`
(`GameGateway`). Ein **Socket.IO-Raum pro Lobby** (Raumname = Lobby-Code). Eingehende Events =
Intents (`lobby:create`, `lobby:join`, `fleet:place`, `shot:fire`, `lobby:leave`); ausgehende
Events = autoritative State-/Event-Updates (`lobby:state`, `game:view`, `shot:result`,
`turn:changed`, `timer:tick`/`timer:expired`, `game:over`, `error`).

**Rationale**: Native Nest-Integration nutzt das bestehende DI-Container-/Modul-Modell (Wiederverwendung
von `SessionService`, `GuestTokenService`, Prisma). Socket.IO-Räume bilden Lobbys 1:1 ab und
liefern Reconnect-Fallbacks „out of the box" (hier ungenutzt, da Reconnect ausgeklammert). Entspricht
der festgelegten Realtime-Entscheidung der Projektspezifikation (§7.2).

**Alternatives considered**: Rohes `ws` (kein Raum-/Adapter-Konzept, mehr Eigenbau); separater
Socket-Microservice (unnötige Topologie für Einzelinstanz-Ziel); Colyseus (laut §7.2 bewusst nicht
gewählt).

---

## 2. Mehr-Instanz-Backplane: Socket.IO-Redis-Adapter

**Decision**: `@socket.io/redis-adapter` mit zwei dedizierten `ioredis`-Verbindungen (pub/sub),
gesetzt am `IoAdapter` beim Bootstrap (`main.ts`). Ein eigener `RedisModule`/`RedisService`
verwaltet den Lebenszyklus aller Clients.

**Rationale**: Macht Broadcasts in einen Lobby-Raum instanzübergreifend zustellbar, ohne die
Event-Semantik zu ändern → das System ist **mehr-Instanz-fähig** (Capability), während das
gemessene Lastziel Einzelinstanz bleibt (SC-009, Plan/Complexity Tracking). Additive Erweiterung,
kein späterer Transport-Umbau nötig.

**Alternatives considered**: Kein Adapter (Single-Instance-only) — müsste später ersetzt werden;
`@socket.io/redis-streams-adapter` — sinnvoll bei sehr hohem Durchsatz, hier Overkill.

---

## 3. Socket-Handshake-Authentifizierung (Identität auf dem Socket)

**Decision**: Eine **Socket.IO-Middleware** (`io.use(...)`) liest beim Handshake die **gleichen**
Credentials wie die HTTP-Schicht: `cookie`-Header → `SESSION_COOKIE` (eingeloggt, via
`SessionService.validateAndRotate`) bzw. `GUEST_COOKIE` (Gast, via `GuestTokenService.verify`),
sonst anonym. Die Auflösung liegt in einer **reinen** Funktion `ws-identity.ts`
(`(cookies) => Identity`), die `socket.data.identity` setzt. Cookie-Parsing aus dem
Handshake-Header mit derselben Logik wie `cookie-parser`.

**Rationale**: Eine einzige Identitätsquelle für REST und WS (Wiederverwendung der M2-Services,
keine zweite Auth). Reine Funktion ist ohne Socket testbar. Cookies werden vom Browser bei
`withCredentials`/Same-Origin automatisch mitgesendet — passt zum bestehenden Dev-Rewrite-Proxy.

**Capability-Gate**: `lobby:create` erfordert `identity.kind === 'user'` (FR-001) — wiederverwendet
`loggedInGate`/`canCreateLobby` aus `auth/identity.ts` (in M2 bereits als Naht angelegt). Beitritt
erlaubt user **oder** guest (FR-003).

**Alternatives considered**: Eigenes Socket-Token im `auth`-Payload (zweiter Auth-Pfad, mehr
Angriffsfläche); JWT-only (würde das bestehende DB-Session-Modell umgehen).

---

## 4. Serialisierung & Ablage des Live-Spielzustands in Redis

**Decision**: Der **kanonische** Zustand ist der Engine-`GameState` (beide Boards, `turn`,
`status`, `winner`, `config`). Pro Lobby wird ein JSON-Dokument unter `lobby:{code}` gehalten,
das **Transport-Metadaten** (Seats↔PlayerId, Presence, „placed"-Flags, eingereichte Flotten
während `placing`, Zug-Deadline, verarbeitete `moveId`-Menge) **und** den serialisierten
`GameState` (ab `in_progress`) kapselt. Schreibzugriffe erfolgen über `lobby.repository.ts` mit
**optimistic locking** (Redis `WATCH/MULTI/EXEC` bzw. Lua-Script) zur Vermeidung von Lost-Updates
bei gleichzeitigen Events. TTL je Lobby (Sliding-Expire), Index `code` ist zugleich der Key.

**Rationale**: Engine-`GameState` ist bereits ein reines, JSON-serialisierbares Werteobjekt
(`readonly`-Strukturen, keine Klassen) → verlustfreie (De-)Serialisierung. Trennung von
„Engine-Wahrheit" und „Transport-Metadaten" hält Prinzip III sauber. Atomare Updates verhindern
Race-Conditions bei schnellem Doppel-Event (relevant für Idempotenz/Timer).

**Alternatives considered**: Redis-Hash je Feld (feingranular, aber komplexere Atomarität für ein
zusammenhängendes Zustandsobjekt); In-Memory-Map (nicht mehr-instanz-fähig, widerspricht §2).

**TTL-Werte**: Wartende Lobby ohne zweiten Beitritt → **10 min** Auto-Close (FR-011); laufende
Partie → großzügigere TTL (z. B. 2 h), bei jedem Event erneuert; `finished` → kurze Rest-TTL,
dann Aufräumen (Persistenz ist dann in Postgres).

---

## 5. Serverseitiger Zug-Timer

**Decision**: Die **Deadline** (`turnDeadline`: absoluter Zeitstempel) ist Teil des Lobby-Redis-
Dokuments und wird bei Zugbeginn / nach Treffer-mit-Extrazug neu gesetzt (FR-022). Die Instanz, die
den Lobby-Raum bedient, hält einen **In-Process-Watcher** (`setTimeout`/leichter Interval pro
aktivem Spiel) `turn-timer.service.ts`; bei Ablauf prüft sie atomar gegen die Redis-Deadline,
führt den **Zugverfall** aus (Zugwechsel ohne Schuss, FR-021) und broadcastet `turn:changed`. Der
Client erhält die Deadline (nicht nur eine Zahl) und rendert den Countdown clientseitig daraus
(server bestimmt die Wahrheit, SC-006). Bei Timer-Einstellung „aus" wird keine Deadline gesetzt
(FR-023).

**Rationale**: Deadline-im-State + Watcher ist robust gegen Drift (Client rechnet nur Anzeige aus
der absoluten Deadline) und einfach für das Einzelinstanz-Ziel. Die atomare Re-Prüfung gegen Redis
verhindert, dass ein veralteter Timer einen bereits erfolgten Zug „überholt".

**Multi-Instanz-Hinweis (dokumentiert, nicht Lastziel)**: Da der Watcher instanzlokal ist, gehört
er der raum-besitzenden Instanz; bei echtem Mehr-Instanz-Betrieb müsste die Timer-Ownership an die
Raum-Affinität gebunden werden (z. B. Sticky-Sessions oder ein einzelner Timer-Owner). Für SC-009
(Einzelinstanz) ist dies kein Thema; explizit als spätere Robustheitsarbeit vermerkt.

**Alternatives considered**: Redis-Keyspace-Notifications/TTL-Expiry als Timer (fragil, „at-least-
once", schwer testbar); reiner Client-Timer (verletzt Server-Autorität); BullMQ/Job-Queue (zu
schwergewichtig).

---

## 6. Lobby-Code-Generierung

**Decision**: Reiner Generator `lobby-code.ts`: 6–8 Zeichen aus **Crockford-Base32** ohne
mehrdeutige Zeichen (kein `0/O`, `1/I/L`), optional gruppiert (`ABCD-EF`), injizierbarer
Zufall (RNG-Parameter, kein globaler Zufall — Prinzip III-Geist/Determinismus-Constraint).
Kollisionsprüfung gegen Redis beim Erstellen (erneut ziehen bei Treffer). Coderaum groß genug,
um Erraten zu erschweren (FR-002).

**Rationale**: Menschlich gut lesbar/diktierbar (Spec §3.2 Beispiel `7K3-Q9X`); injizierbarer
Zufall macht den Generator unit-testbar (deterministisch mit Seed).

**Alternatives considered**: UUID (nicht lesbar); reine Ziffern (zu kleiner Raum, leicht erratbar);
Wortlisten (Lokalisierungs-/Filteraufwand).

---

## 7. Idempotente Zug-Events (`moveId`)

**Decision**: Der Client erzeugt pro Schuss-Intent eine eindeutige `moveId` (UUID) und sendet sie
mit `shot:fire`. Der Server hält je Lobby eine Menge verarbeiteter `moveId`s im Redis-Dokument.
Reine Logik `move-dedup.ts` entscheidet: bereits gesehen → **No-Op**, identisches vorheriges
Ergebnis erneut emittieren (kein zweiter Engine-Aufruf, kein Doppelzählen, FR-017/SC-008). Die
Prüfung + `applyShot` + State-Write erfolgen in **einer** atomaren Redis-Transaktion.

**Rationale**: Client-erzeugte ID ist re-send-stabil (Lag/Reconnect-freies Re-Try). Atomarität
schließt das Doppel-Apply-Fenster bei nahezu gleichzeitigen Duplikaten.

**Alternatives considered**: Server-Sequenznummer (benötigt zusätzliche Round-Trip-Synchronisation);
Dedup nur im Speicher (verliert bei Instanzwechsel die Historie).

---

## 8. Fog of War — strukturelle Garantie

**Decision**: **Jede** client-gerichtete Sicht auf den Spielzustand wird ausschließlich über die
Engine-Funktion `viewFor(state, player)` erzeugt; eine dünne reine Hülle `fog-of-war.ts` ist der
**einzige** erlaubte Pfad vom `GameState` zu einem client-emittierten Payload. Das Gateway
serialisiert niemals `GameState` oder ein gegnerisches `Board` direkt an einen Client. Ein
dedizierter Integrationstest sendet eine ganze Partie und assertet, dass **kein** emittiertes
Event ungetroffene gegnerische Schiffszellen enthält (SC-003).

**Rationale**: `viewFor` ist bereits die getestete SSoT für die Sichtbarkeit (gibt `own` voll +
nur eigene Schussergebnisse auf den Gegner zurück). Indem das die einzige Naht ist, wird Fog of
War strukturell statt durch Sorgfalt garantiert.

**Alternatives considered**: Manuelles „Schwärzen" des Zustands im Gateway (fehleranfällig, Leak-
Risiko); zwei getrennte State-Objekte je Spieler (Drift-Risiko zur Engine-Wahrheit).

---

## 9. Seat↔PlayerId-Zuordnung & Startspieler

**Decision**: Die Lobby vergibt **Seats** (Host = Seat 0, Beitretender = Seat 1). Beim Übergang
`placing → in_progress` werden Seats deterministisch auf Engine-`PlayerId` (`A`/`B`) abgebildet
(Host→`A`). `createGame` startet deterministisch mit `A` (Engine-Verhalten). Damit ist der
Startspieler bestimmt (FR-009) ohne Engine-Änderung.

**Rationale**: Hält die Engine unverändert (Startspieler `A` ist dort fix) und macht die Zuordnung
explizit/testbar. Eine spätere Zufalls-/Wechsel-Startregel ließe sich über die Seat→PlayerId-Map
ergänzen, ohne die Engine anzufassen.

**Alternatives considered**: Engine um wählbaren Startspieler erweitern (verstößt gegen „Engine
unverändert"); Münzwurf serverseitig jetzt (nicht von der Spec gefordert, YAGNI).

---

## 10. Persistenz bei Partieende (`Match`, `MatchMove`) + Stats-Naht

**Decision**: Bei `status === 'finished'` (regulär oder Aufgabe FR-010a) schreibt
`match.service.ts` **einmal** pro Partie: einen `Match`-Datensatz (Code, Spieler/Seat-Identitäten,
`mode = 'pvp'`, Einstellungen, `winnerId`, `startedAt/endedAt`, `status`) und die `MatchMove`-Zeilen
(Zug-Ledger: `turnIndex`, `byPlayer`, `x`, `y`, `result`) als Batch in **einer** Transaktion.
Anschließend wird je **eingeloggtem** Teilnehmer der bestehende idempotente Schreibpfad
`StatsService.recordResult(userId, resultId, outcome)` aufgerufen — `resultId` = stabile
Match-Kennung (z. B. `match.id`), sodass eine erneute Meldung garantiert nicht doppelt zählt
(FR-026/SC-008). Gäste werden übersprungen (FR-025). Die Abbildung `GameState + Seats →
{ winnerSeat, perPlayerOutcome, movePayload }` liegt in der **reinen** Funktion `pvp-result.ts`.

**Rationale**: Wiederverwendung des erprobten idempotenten Stats-Ledgers; klare Trennung von
Live-State (Redis) und End-Persistenz (Postgres). `pvp-result.ts` ist ohne DB testbar.

**Idempotenz auf Match-Ebene**: `Match` erhält einen eindeutigen Schlüssel (z. B. `lobbyCode` +
abgeschlossener-Marker bzw. ein aus der Lobby abgeleiteter eindeutiger `matchKey`), damit auch der
Match/MatchMove-Schreibvorgang bei doppeltem „finished"-Trigger nur einmal ausgeführt wird.

**Alternatives considered**: Nur `MatchResult`-Ledger ohne `Match`/`MatchMove` (verliert
Partiekontext; Nutzervorgabe verlangt §9-Modelle); Persistenz pro Zug live (unnötiger DB-Hot-Path,
Batch bei Ende genügt).

---

## 11. Teststrategie für Gateway + Redis

**Decision**: Zwei Ebenen.
- **Unit (TDD, ohne I/O)**: reine Funktionen `lobby-state`, `lobby-code`, `fog-of-war`,
  `move-dedup`, `pvp-result`, `ws-identity` — Red→Green→Refactor.
- **Integration**: gebootstrappte Nest-App + `socket.io-client`. Redis im Test über
  **`ioredis-mock`** (schnell, keine externe Abhängigkeit im Unit-/Default-Lauf); zusätzlich ein
  optionaler Lauf gegen echtes Redis im CI-`server`-Job (Service-Container) zur Adapter-/
  Atomaritäts-Absicherung. Auswahl per Env (`REDIS_URL` gesetzt → echtes Redis, sonst Mock).
  Pflicht-Szenarien: Zugvalidierung (nicht am Zug / bereits beschossen / out-of-bounds),
  **Fog-of-War-Leak-Test** (kein gegnerisches Schiff in irgendeinem Event), Timer-Ablauf
  (Deadline-Manipulation via injizierbarer Zeit), Idempotenz (doppelte `moveId`), Lebenszyklus
  (waiting→placing→in_progress→finished, Pre-Game-Leave FR-011a, Disconnect-Forfeit FR-010a),
  Persistenz/Stats-Naht.

**Rationale**: `ioredis-mock` hält die Default-Suite hermetisch/schnell (wie die bestehende
Vitest-Strategie); ein realer Redis-Lauf im CI deckt Adapter-/Transaktions-Feinheiten ab.
Injizierbare Zeit (Timer) folgt dem Determinismus-Constraint der Verfassung.

**Alternatives considered**: Nur echtes Redis (langsamer, externe Abhängigkeit im lokalen Lauf);
nur Mock (verpasst Adapter-/Atomaritätsrealität) — daher beide.

---

## 12. Lokales Redis & CI

**Decision**: `docker-compose.yml` erhält einen `redis`-Dienst (`redis:7-alpine`, Host-Port
**6380**→Container 6379 zur Konfliktvermeidung, optionales Volume, Healthcheck). `.env.example`
ergänzt `REDIS_URL=redis://localhost:6380`. Der CI-`server`-Job bekommt einen Redis-Service-
Container neben Postgres.

**Rationale**: Konsistent zur bestehenden Postgres-Compose-Konvention (M2: Host-Port 5433 gegen
Konflikte). Hält den Quickstart einfach.

**Alternatives considered**: Embedded/in-memory-only (verpasst realen Adapter); Standard-Port 6379
(Konfliktrisiko mit lokal installiertem Redis) — daher 6380.

---

## 13. Minimales Anti-Abuse (FR-006a/b)

**Decision**: (a) **Beitritts-Drosselung**: pro Verbindung/Identität ein Zähler in Redis mit
kurzem Sliding-Window auf fehlgeschlagene `lobby:join`-Versuche (Schutz gegen Code-Erraten) →
temporäre Ablehnung bei Überschreitung. (b) **Obergrenze offener Lobbys**: beim `lobby:create`
zählt der Server die nicht-beendeten Lobbys des eingeloggten Nutzers in Redis und lehnt über einem
Limit ab. **Kein** Zug-/Event-Throttling, **kein** inhaltlicher Namensfilter (explizit Folge-
Feature).

**Rationale**: Genau der in der Klärung festgelegte minimale Umfang; nutzt das ohnehin vorhandene
Redis. Klein und zweckgebunden (Prinzip IV).

**Alternatives considered**: Volles Rate-Limiting-Framework (über Scope); gar kein Schutz (Code-
Erraten-Risiko bei Beitritt-per-Code, von der Klärung ausgeschlossen).

---

## Offene Punkte → bewusst der Implementierung/Folge-Features überlassen

- Genaue TTL-Feinwerte und Sliding-Window-Parameter (Implementierungsdetail; Defaults oben).
- Observability/Logging/Metriken des Gateways (in der Spec als planungsrelevant/Deferred markiert).
- Echte Mehr-Instanz-Timer-Ownership (erst bei tatsächlichem Skalierungsbedarf, M4/M5).
