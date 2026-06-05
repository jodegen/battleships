# Phase 0 — Research: Reconnect-Handling für laufende PvP-Partien

Aufbau strikt additiv auf Feature 004 (Socket.IO-Gateway, Redis-Live-State, server-autoritative
Engine, in-process Zug-Timer, Match/MatchMove/Stats-Persistenz). Ziel: das in 004 für
`in_progress` festgelegte **Sofort-Forfeit** (FR-010a) durch ein **60-s-Reconnect-Fenster** mit
Pause, Zustands-Wiederherstellung und idempotenter Aufgabe-Wertung ersetzen — ohne neue
Spielregel-Quelle, ohne Schemaänderung an der Persistenz.

Jeder Eintrag: **Decision / Rationale / Alternatives considered**.

---

## 1. Reconnect-Credential: per-Seat-Token + Identitäts-Fallback

**Decision**: Der Server erzeugt beim Belegen eines Sitzes (create/join) pro Seat ein
kryptografisch zufälliges **Reconnect-Token** (z. B. 32 Byte base64url, `randomBytes`), speichert
es im `LobbyRecord`-Seat (`reconnectToken`) und gibt es dem jeweiligen Client im **Ack** von
`lobby:create`/`lobby:join` zurück. Wiedereintritt erfolgt über einen neuen Intent
`reconnect:resume { code, token }`. Autorisierung gilt als erfolgreich, wenn **entweder** das Token
exakt mit `seat.reconnectToken` übereinstimmt **oder** (FR-003a) die aufgelöste Socket-Identität
ein `user` ist, dessen `userId` der `seat.identity.userId` entspricht. Für **Gäste** ist
ausschließlich der Token-Pfad zulässig (an die Browser-Session gebunden).

**Rationale**: Erfüllt FR-001/FR-002 (Token pro Spieler+Partie, Ablehnung fremder/ungültiger
Token) und FR-003a (eingeloggte Spieler kehren konto-weit von jedem Gerät zurück, auch ohne
lokal gespeichertes Token). Der Token-Vergleich ist ein einfacher konstanter String-Vergleich;
keine zusätzliche Krypto-Infrastruktur nötig. Token lebt im ohnehin vorhandenen `LobbyRecord`
(eine Quelle), kein zweiter Store.

**Alternatives considered**:
- *Nur Identitäts-/Cookie-Bindung (kein Token)*: Genügt für eingeloggte Nutzer (Session-Cookie),
  aber **nicht** für Gäste sauber pro Partie (ein Gast-Cookie ist nicht partie-gebunden) und
  widerspricht der ausdrücklichen Spec-Vorgabe „pro Spieler ein Reconnect-Token" (FR-001).
- *Signiertes, selbst-enthaltenes Token (HMAC, wie Gast-Token)*: Unnötig — der Sitz ist ohnehin
  serverseitig in Redis materialisiert; ein opakes Zufallstoken + Server-Lookup ist einfacher und
  erlaubt sofortige Invalidierung mit dem Lobby-Record.
- *Token im HTTP-Cookie statt im Ack*: Cookies sind nicht partie-spezifisch und kollidieren bei
  mehreren Tabs/Partien; das Ack liefert das Token genau dem berechtigten Client.

---

## 2. Disconnect während `in_progress`: Pause + Grace statt Forfeit

**Decision**: `handleDeparture` (Gateway) wird für den Zweig `status === 'in_progress'`
umgeschrieben: Statt sofort `finished`/forfeit wird der Sitz als **getrennt** markiert
(`connected: false`), eine **Grace-Deadline** `now + 60_000` im Seat gesetzt
(`reconnectDeadline`), der **laufende Zug-Timer pausiert** (siehe §3) und ein **Grace-Timer** je
Seat gestartet. Der Raum erhält `opponent:disconnected { code, playerId, graceDeadline }` und ein
aktualisiertes `lobby:state` (Seat `connected:false`). Die Zweige `waiting`/`placing` bleiben
**unverändert** (Host weg → Lobby schließt; zweiter Spieler weg → zurück zu `waiting`), FR-018.

**Rationale**: Minimaler, lokal begrenzter Eingriff in den bestehenden Disconnect-Pfad; nutzt das
vorhandene atomare `repo.update(code, mutator, ttl)` für die Zustandsänderung. 60 s ist fix
(FR-006). Jede neue Trennung setzt eine **frische** Deadline (FR-006, kein Anti-Stalling).

**Alternatives considered**:
- *Sofort-Forfeit beibehalten + separater „Rejoin"-Pfad*: Würde die Partie schon beendet haben,
  bevor der Reconnect kommt — widerspricht FR-004/FR-014. Verworfen.
- *Pause global pro Lobby statt pro Seat*: Reicht für die Pause selbst, aber die „erstes Fenster
  entscheidet"-Regel (FR-014a) und der Fall beider getrennter Spieler brauchen **pro-Seat**
  Deadlines. Daher Deadline am Seat.

---

## 3. Zug-Timer pausieren & mit Restzeit fortsetzen

**Decision**: Beim Disconnect wird die verbleibende Zugzeit als
`pausedTurnRemainingMs = max(0, turnDeadline − now)` im `LobbyRecord` persistiert und
`turnDeadline` auf `null` gesetzt; der In-Process-Zug-Timer wird via `TurnTimerService.clear(code)`
gestoppt. Bei `turnTimerSeconds === null` (Timer aus) ist `pausedTurnRemainingMs = null` (nur die
Zug-Sperre greift). Beim **erfolgreichen Reconnect**, **sofern beide Sitze wieder verbunden sind**,
wird `turnDeadline = now + pausedTurnRemainingMs` gesetzt, `pausedTurnRemainingMs` geleert und der
Zug-Timer über `armTimer`/`TurnTimerService.schedule` neu mit der Restzeit bewaffnet. Solange noch
ein Sitz getrennt ist, bleibt der Zug-Timer pausiert.

**Rationale**: Die bestehende Timer-Architektur ist deadline-basiert (absoluter ms-Zeitstempel) und
re-derivierbar — das Festhalten der Restzeit und Neusetzen der Deadline ist exakt und übersteht
auch einen Instanzwechsel (Deadline liegt in Redis). `now()` ist im Gateway/Service bereits
**injizierbar**, daher in Tests deterministisch (SC-004). Erfüllt FR-011/FR-012/FR-013.

**Alternatives considered**:
- *Timer weiterlaufen lassen, Ablauf ignorieren*: Bricht SC-004 (Restzeit muss erhalten bleiben)
  und kompliziert die Ablauf-Logik. Verworfen.
- *Verbleibende Zeit clientseitig halten*: Verstößt gegen Server-Autorität (Timer ist serverseitig,
  Prinzip I). Verworfen.

---

## 4. Grace-Timer: separater per-Seat-Watcher

**Decision**: Neuer `GraceTimerService` analog zu `TurnTimerService`, aber **per Seat** verschlüsselt
(`Map<\`${code}:${playerId}\`, NodeJS.Timeout>`), mit `schedule(code, playerId, deadline, onExpire)`
und `clear(code, playerId)` / `clearAll(code)`. Bei Ablauf ruft er einen Gateway-Callback
`onGraceExpired(code, playerId)` auf, der die Partie als Aufgabe wertet.

**Rationale**: Der vorhandene `TurnTimerService` ist single-timer-pro-Code und semantisch belegt;
ein eigener, gleich strukturierter Service hält die Verantwortlichkeiten getrennt (Prinzip IV) und
unterstützt **zwei gleichzeitige** Grace-Fenster (beide getrennt). Gleiches injizierbares `now()`.

**Alternatives considered**:
- *Redis-Keyspace-Notifications/TTL-Expiry als Trigger*: Mehr-Instanz-sauberer, aber deutlich mehr
  Infrastruktur und nicht nötig beim Einzelinstanz-Lastziel (SC-009 aus 004). Die Grace-Deadline
  liegt zwar in Redis (Quelle der Wahrheit), der **Auslöser** ist wie beim Zug-Timer ein
  In-Process-Watcher der raum-besitzenden Instanz. Notiert als spätere Skalierungsoption.
- *Zug-Timer-Service erweitern*: Vermischt zwei Timer-Semantiken; verworfen zugunsten Klarheit.

---

## 5. Aufgabe-Wertung bei Ablauf + „erstes Fenster entscheidet"

**Decision**: `onGraceExpired(code, playerId)` führt eine atomare `repo.update` aus, die **nur**
greift, wenn `status === 'in_progress'` und der Seat weiterhin `connected === false` ist: Sie setzt
`status: 'finished'`, `game.status: 'finished'`, `game.winner = opponentOf(playerId)` und gibt den
Sieger zurück. Danach `clearAll`-Timer, Broadcast `game:over { winner, reason: 'forfeit' }` und der
bestehende `finishAndPersist(record, winner, 'FORFEITED')`-Pfad. Sind **beide** getrennt, gewinnt
der Inhaber des **später** ablaufenden Fensters — der zuerst ablaufende Grace-Timer triggert die
Wertung (FR-014a). Die Idempotenz folgt aus der `status`-Guard plus dem bestehenden
`matchKey`-Unique-Constraint im Persistenzpfad (FR-016).

**Rationale**: Wiederverwendung des **gesamten** bestehenden End-/Persistenz-/Stats-Pfads aus 004
(`finishAndPersist`, `MatchStatus.FORFEITED`, idempotente `stats.recordResult` über `matchId`).
**Keine** Prisma-Schemaänderung, **kein** neues Migrations-Risiko. Der `status`-Guard verhindert
Doppelwertung bei zwei feuernden Grace-Timern oder bei Reconnect/Forfeit-Race.

**Alternatives considered**:
- *Neuer `MatchStatus.ABANDONED`*: Semantisch feiner, aber Forfeit bildet „Aufgabe durch
  Nichterscheinen" bereits korrekt ab; ein neuer Enum-Wert erzwänge Migration + Stats-Anpassung
  ohne Mehrwert für dieses Feature. Verworfen (YAGNI, Prinzip IV).
- *Neuer `GameOverMsg.reason`-Wert (`'abandoned'`)*: Optionaler UI-Feinschliff; nicht nötig, da der
  verbliebene Client den Trennungs-Kontext bereits aus `opponent:disconnected` kennt. `'forfeit'`
  bleibt.

---

## 6. Zustands-Wiederherstellung beim Reconnect (Fog of War)

**Decision**: Nach erfolgreicher Autorisierung von `reconnect:resume` wird der neue Socket dem
Lobby-Raum (`socket.join(code)`) zugeordnet und `socket.data.lobby = { code, playerId }` gesetzt.
Der **sichtbare Teilzustand** wird **ausschließlich** über die bestehende
`projectGameView(code, game, playerId, turnDeadline)` (→ engine `viewFor`) an genau diesen Socket
gesendet (`game:view`), zusätzlich aktuelles `lobby:state` an den Raum und `opponent:reconnected`
an den Gegner. Ist nach dem Reconnect **kein** Sitz mehr getrennt, wird der Zug-Timer reaktiviert
(§3) und ein `turn:changed { reason: 'resume' }` mit der neuen `turnDeadline` an den Raum gesendet.

**Rationale**: Die Wiederherstellung benutzt **denselben** Fog-of-War-Projektor wie der reguläre
Spielfluss — strukturelle Garantie, dass ungetroffene gegnerische Schiffe **nie** ausgeliefert
werden (FR-009/FR-020, SC-002). Kein zweiter Serialisierungspfad, kein Risiko eines Leak über einen
neuen Code-Pfad. Der wiederhergestellte Zustand (eigene Flotte/Schäden, eigene Schüsse+Ergebnisse,
Zug-Inhaber, Restzeit) ergibt sich vollständig aus `viewFor` + `turnDeadline` (FR-008).

**Alternatives considered**:
- *Eigene „resume snapshot"-Serialisierung*: Dupliziert Projektionslogik → Leak-Risiko und
  Drift gegen `viewFor`. Verworfen (Prinzip III).

---

## 7. Reconnect nach Fenster-Ablauf (Partie schon beendet)

**Decision**: `finishAndPersist` löscht heute den Lobby-Record sofort. Damit ein **verspäteter**
Reconnect das Endergebnis erfährt (FR-017), wird beim Forfeit-durch-Ablauf vor dem Löschen ein
kompakter **Terminal-Marker** in Redis abgelegt: `match-result:{code}` →
`{ winner, reason: 'forfeit', endedAt }` mit kurzer TTL (z. B. 120 s). `reconnect:resume` mit
gültigem Token, aber fehlendem aktivem Lobby-Record, liest diesen Marker und sendet dem Client ein
terminales `game:over` (kein Wiedereintritt). Fehlt auch der Marker → Ack
`{ ok:false, error:'lobby-not-found' }`.

**Rationale**: Erfüllt FR-017 („beendetes Endergebnis mitteilen, kein Wiedereintritt") mit minimalem
Footprint; vermeidet einen Prisma-Read im Hot-Path des Reconnect. TTL begrenzt den Speicher.

**Alternatives considered**:
- *Match aus Postgres per `matchKey` nachladen*: Korrekt, aber teurer und an die DB gekoppelt; der
  flüchtige Marker genügt für die kurze Reconnect-Spanne. (DB-Fallback als spätere Option notiert.)
- *Lobby-Record in `finished` mit kurzer TTL behalten statt löschen*: Funktioniert ebenfalls, hält
  aber den vollen (großen) Record vor; der schlanke Marker ist sparsamer.

---

## 8. Client: Token überdauert Reload + Auto-Reconnect + Gegner-Countdown

**Decision**:
- **Token-Persistenz**: `src/realtime/reconnect-store.ts` speichert `{ code, token, playerId }` in
  `localStorage` (Schlüssel `schiffe.reconnect`), gesetzt aus den `lobby:create`/`lobby:join`-Acks;
  geräumt bei `game:over`, explizitem `lobby:leave` und beim Beitreten/Erstellen einer neuen Lobby.
- **Auto-Reconnect**: `socket.io-client` reconnectet den Transport bereits per Default; ergänzt wird
  ein `socket.on('connect', …)`-Handler, der bei vorhandenem gespeichertem Token automatisch
  `reconnect:resume { code, token }` emittiert. `withCredentials` bleibt (Cookie-Identität für den
  FR-003a-Pfad).
- **UI**: `useOnlineGame` exponiert `opponentDisconnect: { playerId; graceDeadline } | null`
  (aus `opponent:disconnected`/`opponent:reconnected`) und `selfReconnecting: boolean` (aus
  `socket` `disconnect`/`connect`). `OpponentStatus` zeigt „Gegner getrennt – wartet (xx s)" mit
  Countdown (gleiche absolute-Deadline-Logik wie `TurnTimer`), beim eigenen Aussetzer
  „Verbindung verloren – neu verbinden …".

**Rationale**: `localStorage` überdauert Reload und kurze Aussetzer (Gast-Anforderung: gilt, solange
Browser-Session/Storage lebt — FR-003). Wiederverwendung der vorhandenen
absoluten-Deadline-Countdown-Logik (`TurnTimer`) für den Gegner-Countdown hält den Client schlicht
(kein neues Design, Nutzervorgabe). Server bleibt autoritativ; der Client zeigt nur an.

**Alternatives considered**:
- *`sessionStorage`*: Überlebt Tab-Schließen nicht; `localStorage` deckt Reload **und** kurzen
  Tab-Wechsel ab und passt zur Gast-Klausel. (Tab-Close = Session verloren bleibt erwartetes
  Nicht-Reconnect, FR-003.)
- *Manueller „Wieder beitreten"-Button*: Schlechtere UX; Auto-Resume bei vorhandenem Token ist die
  Nutzervorgabe.

---

## 9. Teststrategie (TDD für nicht-triviale Logik)

**Decision**:
- **Unit (rein, TDD zuerst)** mit Vitest:
  - `reconnect-token.ts`: Erzeugung (Eindeutigkeit/Format), Verifikation (Match/Mismatch).
  - `reconnect-state.ts`: `markDisconnected` (setzt Deadline, persistiert Restzeit, `turnDeadline=null`),
    `markReconnected` (resume nur wenn beide verbunden, `turnDeadline` aus Restzeit), `resolveAbandon`
    (Sieger = Gegner; Guard auf Status/connected), „beide getrennt → erstes Fenster entscheidet".
- **Integration (`socket.io-client` gegen gebootstrappte Nest-App + Test-Redis)** mit injiziertem
  `now()`:
  1. **Timer-Pause während Trennung**: Disconnect am Zug → nach Reconnect entspricht `turnDeadline`
     der Restzeit (±1 s, SC-004); während der Pause kein Ablauf.
  2. **State-Wiederherstellung ohne Leak**: Reconnect liefert eigene Flotte + eigene Schuss-Historie;
     **kein** emittiertes Event enthält ungetroffene gegnerische Schiffszellen (SC-002, Leak-Scan).
  3. **Aufgabe nach 60 s**: Grace-Ablauf → `game:over(forfeit)`, Sieger = verbliebener Spieler,
     genau eine Stats-Fortschreibung (SC-005), kein Doppel-Persist.
  4. **Beide gleichzeitig getrennt**: Zwei Grace-Fenster; das zuerst ablaufende wertet, der andere
     gewinnt (FR-014a); genau eine Wertung.
  - Ergänzend: ungültiges/fremdes Token → `reconnect:resume` abgelehnt, Sitz unverändert (SC-007);
    verspäteter Reconnect → terminales `game:over` (FR-017).

**Rationale**: Deckt exakt die vier vom Nutzer geforderten Testfälle plus die kritischen Invarianten
(Fog of War, Idempotenz). Folgt dem etablierten 004-Testaufbau (FakeSocket im Web, `socket.io-client`
im Server, injizierbares `now()`), sodass Zeitabläufe deterministisch sind.

**Alternatives considered**:
- *Echte 60-s-Wartezeit in Tests*: langsam und flaky; injiziertes `now()` + manuelles Vorrücken ist
  deterministisch (bestehendes Muster). Verworfen.

---

## Zusammenfassung der Entscheidungen

| Thema | Entscheidung | Schema-/Engine-Änderung? |
|------|--------------|--------------------------|
| Reconnect-Credential | Per-Seat-Zufallstoken + User-Identitäts-Fallback (FR-003a) | nein |
| Disconnect `in_progress` | Pause + 60-s-Grace statt Forfeit | nein |
| Zug-Timer | Restzeit persistieren, bei beidseitiger Verbindung mit Restzeit fortsetzen | nein |
| Grace-Timer | Neuer per-Seat-In-Process-Watcher (`GraceTimerService`) | nein |
| Aufgabe-Wertung | Bestehender `finishAndPersist` + `MatchStatus.FORFEITED`, status-Guard idempotent | **nein** (kein neues Prisma-Modell) |
| Wiederherstellung | Ausschließlich über bestehendes `projectGameView`/`viewFor` | nein |
| Late-Reconnect | Flüchtiger `match-result:{code}`-Marker (kurze TTL) | nein |
| Client | Token in `localStorage`, Auto-`reconnect:resume`, Gegner-Countdown-UI | — |

**Alle [NEEDS CLARIFICATION] aus der Technical Context sind aufgelöst.** Keine Engine-Änderung,
keine Prisma-Migration; das Feature ist ein additiver Layer über 004.
