# Contract — WebSocket-Events (Socket.IO)

Versionierter, typisierter Nachrichten-Vertrag zwischen Client und Server (Verfassung: Transport).
**Intents hinein** (Client→Server), **autoritative State/Events heraus** (Server→Client). Der
Server sendet **niemals** rohen `GameState` oder ein gegnerisches `Board`; jede spielbezogene
client-gerichtete Nutzlast entsteht über `viewFor` (Fog of War, FR-013/SC-003).

- **Namespace**: Standard (`/`). **Raum**: Lobby-Code (ein Raum pro Lobby).
- **Auth**: Handshake-Middleware löst Identität aus Cookies auf (Session-Cookie | Gast-Token |
  anonym) → `socket.data.identity`. Siehe research.md §3.
- **Konvention**: `ack`-Callbacks für Intents liefern ein Ergebnis-Objekt
  `{ ok: true, ... } | { ok: false; error: ErrorCode }`. Broadcasts gehen an den Lobby-Raum.

## Fehlercodes (`ErrorCode`)

| Code | Bedeutung | Bezug |
|------|-----------|-------|
| `unauthenticated` | keine gültige Identität, wo erforderlich | FR-001 |
| `forbidden` | Capability fehlt (z. B. Gast will erstellen) | FR-001 |
| `lobby-not-found` | Code unbekannt/geschlossen/abgelaufen | FR-004 |
| `lobby-full` | bereits zwei Spieler | FR-004 |
| `invalid-code` | Codeformat ungültig | FR-002/004 |
| `rate-limited` | zu viele Beitritts-Versuche | FR-006a |
| `too-many-lobbies` | offene-Lobby-Obergrenze erreicht | FR-006b |
| `invalid-placement` | Flotte regelwidrig (Engine `PlacementError`) | FR-015 |
| `not-your-turn` | Schuss außer der Reihe | FR-014 |
| `already-shot` | Feld bereits beschossen | FR-014 |
| `out-of-bounds` | Ziel außerhalb des Felds | FR-014 |
| `not-in-progress` | Aktion im falschen Status | FR-014 |
| `invalid-name` | Gast-Anzeigename ungültig | FR-006 |

---

## Client → Server (Intents)

### `lobby:create`
- **Auth**: nur `user` (FR-001). Gast/anonym → `forbidden`.
- **Payload**: `{ settings: LobbySettings }` (validiert: `allowTouching: boolean`,
  `turnTimerSeconds: 15|30|60|null`, `extraTurnOnHit: boolean`).
- **Ack**: `{ ok: true; code: string; lobby: LobbyView } | { ok: false; error }`
  (`too-many-lobbies` möglich). Erstellt Lobby in `waiting`, Host belegt Seat 0, tritt dem Raum bei.

### `lobby:join`
- **Auth**: `user` **oder** `guest` (FR-003). Gast sendet zusätzlich Anzeigenamen, falls Identität
  noch nicht als Gast etabliert.
- **Payload**: `{ code: string; guestName?: string }`.
- **Ack**: `{ ok: true; lobby: LobbyView } | { ok: false; error }`
  (`lobby-not-found` | `lobby-full` | `invalid-code` | `rate-limited` | `invalid-name`).
- **Effekt**: belegt Seat 1, tritt dem Raum bei; bei zwei Spielern → `placing`. Broadcast
  `lobby:state`.

### `fleet:place`
- **Auth**: Teilnehmer der Lobby; Status `placing`.
- **Payload**: `{ code: string; placements: ShipPlacement[] }`.
- **Validierung**: serverseitig via Engine `validatePlacement(config, placements)`; bei `!ok` →
  Ack `{ ok:false, error:'invalid-placement', reason: PlacementError }` (kein Zustandswechsel,
  FR-015).
- **Ack**: `{ ok: true } | { ok: false; error; reason? }`.
- **Effekt**: setzt `seat.placed = true`; sind **beide** platziert → `createGame(config, fleets)`,
  Status `in_progress`, Startspieler `A`, ggf. Timer-Deadline. Broadcasts `lobby:state` +
  `game:view` (je Spieler eigene Sicht) + `turn:changed`.

### `shot:fire`
- **Auth**: Spieler **am Zug**; Status `in_progress`.
- **Payload**: `{ code: string; moveId: string; target: { x: number; y: number } }`.
- **Idempotenz**: bereits gesehene `moveId` → No-Op, vorheriges Ergebnis erneut an den Schützen
  (FR-017/SC-008). Sonst `applyShot(state, by, target)`:
  - `ShotRejection` → Ack mit `not-your-turn|already-shot|out-of-bounds|not-in-progress`.
  - Erfolg → State-Write (atomar), Broadcasts (s. u.).
- **Ack**: `{ ok: true; result: ShotResult } | { ok: false; error }`.

### `lobby:leave`
- **Payload**: `{ code: string }`.
- **Effekt**: explizites Verlassen; gleiche Behandlung wie Disconnect (s. „Verbindungsabbruch").

---

## Server → Client (autoritative Updates)

### `lobby:state` (Broadcast an Raum)
Aktueller Lobby-/Presence-Status — **ohne** Spielbrettdaten.
```ts
interface LobbyView {
  code: string;
  status: 'waiting' | 'placing' | 'in_progress' | 'finished';
  settings: LobbySettings;
  players: Array<{
    seat: 0 | 1;
    playerId: 'A' | 'B';
    displayName: string;
    isGuest: boolean;
    connected: boolean;   // FR-019
    placed: boolean;      // FR-018/019
  }>;
  turn: 'A' | 'B' | null; // wer am Zug ist (FR-019)
}
```

### `game:view` (gezielt je Spieler — Fog of War)
Die **einzige** Quelle der Brettdaten am Client; pro Empfänger aus `viewFor(state, playerId)`:
```ts
interface GameViewMsg {
  code: string;
  you: 'A' | 'B';
  view: PlayerView;       // engine: { own: Board; opponent: { shots: OpponentShotView[] } }
  turn: 'A' | 'B';
  turnDeadline: number | null; // absoluter ms-Zeitstempel oder null (Timer aus)
}
```
> **Garantie**: `view.opponent.shots` enthält nur Ergebnisse eigener Schüsse; ungetroffene
> gegnerische Schiffe sind **nicht** enthalten (SC-003).

### `shot:result` (Broadcast an Raum)
Ergebnis eines Schusses als Live-Update (FR-018) — koordinaten-/ergebnisbezogen, **ohne** verdeckte
Positionen:
```ts
interface ShotResultMsg {
  code: string;
  by: 'A' | 'B';
  target: { x: number; y: number };
  outcome: 'miss' | 'hit' | 'sunk';
  sunkShip?: { length: number };
}
```
> Da nur das **getroffene** Feld + Ergebnis übertragen wird, ist auch der Broadcast fog-of-war-
> konform (kein ungetroffenes Schiff offengelegt). Clients aktualisieren ihre lokale Sicht;
> optional folgt ein gezieltes `game:view` zur Resynchronisation.

### `turn:changed` (Broadcast)
```ts
interface TurnChangedMsg { code: string; turn: 'A' | 'B'; turnDeadline: number | null; reason: 'shot' | 'miss' | 'timeout' | 'extra-turn'; }
```

### `timer:expired` (Broadcast)
Server hat einen Zug verfallen lassen (FR-021); begleitet/ersetzt durch `turn:changed`
(`reason: 'timeout'`). Optionale `timer:tick`-Events sind **nicht** autoritativ — der Countdown
wird clientseitig aus `turnDeadline` berechnet.

### `game:over` (Broadcast)
```ts
interface GameOverMsg {
  code: string;
  winner: 'A' | 'B';
  reason: 'all-sunk' | 'forfeit'; // forfeit = Disconnect/Leave (FR-010a)
}
```
Danach: Persistenz (Match/MatchMove + Stats) serverseitig; Lobby wird aufgeräumt.

### `error` (gezielt)
`{ error: ErrorCode; message?: string }` für nicht ack-gebundene Fehler.

---

## Verbindungsabbruch / Verlassen (FR-010a / FR-011a)

| Status bei Disconnect/Leave | Verhalten |
|-----------------------------|-----------|
| `waiting`/`placing`, **Host** geht | Lobby schließt; `lobby:state`(closed)/`error` an Restteilnehmer; Redis-Aufräumen. |
| `waiting`/`placing`, **zweiter Spieler** geht | Sitz frei, zurück zu `waiting`; Broadcast `lobby:state`. |
| `in_progress`, einer geht | Sofort `game:over` mit `reason:'forfeit'`, Sieger = verbleibender Spieler; Ergebnis **gewertet** (Persistenz/Stats). |

Reconnect ist **nicht** unterstützt (FR-027): ein erneuter Connect tritt nicht in eine laufende
Partie ein.

---

## Server-Autoritäts-Invarianten (Tests leiten sich hieraus ab)

1. Kein Server→Client-Payload enthält ungetroffene gegnerische Schiffszellen (SC-003). *(Leak-Test)*
2. `shot:fire` außer der Reihe / auf beschossenes/oob-Feld → Reject ohne State-Änderung (FR-014).
3. Doppelte `moveId` → genau eine Wertung (FR-017/SC-008).
4. Timer-Ablauf → genau ein Zugwechsel ohne Schuss; nach Treffer (Extrazug) Deadline-Neustart
   (FR-021/022). *(Zeit injizierbar)*
5. `lobby:create` nur für `user`; `lobby:join` für `user|guest` (FR-001/003).
