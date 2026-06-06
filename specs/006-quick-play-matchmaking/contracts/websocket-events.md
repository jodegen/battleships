# Contract Delta — WebSocket Events (Quick Play 006)

Additive Erweiterung des bestehenden, versionierten WS-Vertrags (`packages/server/src/realtime/events.ts`).
**Keine** Änderung bestehender Events/Acks — nur Ergänzungen. Spiegelbild im Client unter
`packages/web/src/realtime/socket-client.ts`.

## 1. Neue Client→Server-Intents

### `queue:join` → `QueueJoinAck`

Tritt der Quick-Play-Warteschlange bei (nur eingeloggte Spieler).

```ts
// Payload: keiner (Einstellungen sind serverseitig fix = QUICK_PLAY_SETTINGS)
export type QueueJoinAck = Ack<{ status: 'waiting' | 'matched' }>;
```

Server-Verhalten:
1. `identity.kind !== 'user'` → `{ ok:false, error: 'forbidden' }` (Gast) bzw. `'unauthenticated'`
   (anonym). (FR-001)
2. Guard `canEnterQueue`: bereits in Lobby/Partie → `{ ok:false, error: 'already-in-game' }`. (FR-015)
3. Atomares `claim-or-enqueue` (Lua, siehe redis-state.md):
   - **matched** → Lobby via `createLobby`+`joinLobby` erzeugen, **beide** Sockets in den Raum, an beide
     `queue:matched` pushen; Ack `{ ok:true, status:'matched' }`.
   - **waiting** → `quickplay:conn` setzen, 120-s-Timer planen; Ack `{ ok:true, status:'waiting' }`. (FR-002)

Idempotenz: erneutes `queue:join` desselben Users aktualisiert nur den Score (kein zweiter Platz, FR-011).

### `queue:leave` → `QueueLeaveAck`

Bricht die Suche ab, solange noch nicht gepaart (FR-008).

```ts
// Payload: keiner
export type QueueLeaveAck = Ack<Record<string, never>>; // { ok: true }
```

Server-Verhalten: `ZREM quickplay:queue userId`, `quickplay:conn`-Key + Timer löschen, `inQueue=false`.
Immer `{ ok:true }` (idempotent — nicht-wartend ist No-Op). Bereits gepaart → der Spieler ist nicht mehr
in der Queue; ein „Suche abbrechen" ist dann wirkungslos und das Verlassen folgt dem Lobby-Pfad
(`lobby:leave`/Disconnect, FR-010).

## 2. Neue Server→Client-Pushes

### `queue:matched`

An **beide** gepaarten Spieler unmittelbar nach der Paarung.

```ts
export interface QueueMatchedMsg {
  readonly code: string;        // Lobby-Code (intern erzeugt)
  readonly you: PlayerId;       // 'A' (früher Wartender/Host) | 'B'
  readonly lobby: LobbyView;    // = toLobbyView(record), Status 'placing'
  readonly reconnectToken: string; // Seat-Token des Empfängers (für 005-Reconnect)
}
```

Client-Verhalten (`useOnlineGame`): wie ein erfolgreicher create/join — `codeRef` setzen,
`saveReconnect({ code, token, playerId: you })`, `lobby` in den State → der **bestehende**
Platzierungs-/Spielbildschirm übernimmt (kein paralleler Pfad, FR-007).

### `queue:timeout`

An den wartenden Spieler nach Ablauf des 120-s-Fensters ohne Gegner (FR-016).

```ts
export interface QueueTimeoutMsg { readonly reason: 'no-match'; }
```

Client-Verhalten: Wartestatus beenden, „kein Match gefunden" anzeigen, erneute Suche möglich.

## 3. Eventname-Konstanten (additiv)

```ts
export const ClientEvents = {
  // … bestehend …
  queueJoin: 'queue:join',
  queueLeave: 'queue:leave',
} as const;

export const ServerEvents = {
  // … bestehend …
  queueMatched: 'queue:matched',
  queueTimeout: 'queue:timeout',
} as const;
```

## 4. Fehlercodes

`ErrorCode` wird um **`'already-in-game'`** ergänzt (FR-015). Wiederverwendet: `'forbidden'` (Gast),
`'unauthenticated'` (anonym). Keine weiteren neuen Codes.

## 5. Nicht geändert

`lobby:create/join/leave`, `fleet:place`, `shot:fire`, `reconnect:resume` und alle Server→Client-Sichten
(`lobby:state`, `game:view`, `shot:result`, `turn:changed`, `timer:expired`, `game:over`,
`opponent:disconnected/reconnected`) bleiben **unverändert** — Quick Play nutzt sie ab `placing` 1:1.
