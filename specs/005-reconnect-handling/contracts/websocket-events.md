# Contract — WebSocket-Events: Reconnect-Delta (005)

Erweitert den 004-Contract (`specs/004-pvp-realtime-lobbies/contracts/websocket-events.md`).
Es gelten weiterhin: ein Raum pro Lobby, Handshake-Identität aus Cookies in `socket.data.identity`,
**kein** roher `GameState`/gegnerisches Board über die Leitung — jede spielbezogene Projektion
läuft über `viewFor` (Fog of War). Nur **Ergänzungen/Änderungen** sind hier aufgeführt.

---

## Geänderte bestehende Events

### `lobby:create` (Ack erweitert)
- **Ack neu**: `{ ok: true; code: string; lobby: LobbyView; reconnectToken: string } | { ok:false; error }`
- Der Host erhält sein Per-Seat-Reconnect-Token (Seat A) im Ack. Client persistiert
  `{ code, token, playerId:'A' }`.

### `lobby:join` (Ack erweitert)
- **Ack neu**: `{ ok: true; lobby: LobbyView; reconnectToken: string } | { ok:false; error }`
- Der Beitretende (Seat B) erhält sein Token im Ack.

### `lobby:state` (Payload-Semantik präzisiert)
- `players[].connected` spiegelt nun den Reconnect-Zustand: `false`, solange ein Sitz im
  60-s-Fenster getrennt ist. `turn` bleibt erhalten (Partie ist nur pausiert, nicht beendet).

### Verbindungsabbruch während `in_progress` (Verhalten ersetzt FR-010a)
Statt sofortigem `game:over(forfeit)` gilt jetzt:

| Status bei Disconnect/Leave | Verhalten |
|-----------------------------|-----------|
| `waiting`/`placing` | **unverändert** zu 004 (Host weg → Lobby schließt; Spieler B weg → zurück `waiting`) |
| `in_progress`, einer geht | Sitz `connected:false`, 60-s-Grace startet, **Zug-Timer pausiert**; Broadcast `opponent:disconnected` + `lobby:state`. **Kein** sofortiges `game:over`. |
| `in_progress`, Grace läuft ab | `game:over { reason:'forfeit' }`, Sieger = verbliebener Spieler; bestehende Persistenz/Stats. |

> `lobby:leave` während `in_progress` löst denselben Pause+Grace-Pfad aus wie ein Disconnect
> (kein sofortiger Forfeit mehr; ein freiwilliges Verlassen kann durch erneutes `reconnect:resume`
> zurückgenommen werden, solange das Fenster läuft).

---

## Neuer Client → Server Intent

### `reconnect:resume`
- **Auth**: gültige Handshake-Identität (user|guest|anonymous). Autorisierung erfolgt **pro Sitz**.
- **Payload**: `{ code: string; token: string }`
- **Autorisierung** (Server): erfolgreich, wenn
  - `token === seat.reconnectToken`, **oder**
  - Identität ist `user` und `identity.userId === seat.identity.userId` (FR-003a; konto-weit, auch
    ohne lokal gespeichertes Token). **Gäste**: nur Token-Pfad.
- **Ack**:
  - `{ ok: true; you: 'A'|'B' }` — Socket wurde dem Raum/Sitz zugeordnet; es folgen unmittelbar
    `game:view` (gezielt) + `lobby:state` (+ ggf. `turn:changed { reason:'resume' }`).
  - `{ ok: false; error }` mit:
    | Code | Bedeutung |
    |------|-----------|
    | `invalid-code` | Codeformat ungültig |
    | `lobby-not-found` | kein aktiver Record **und** kein Terminal-Marker |
    | `forbidden` | Token/Identität passt nicht zu einem Sitz (FR-002) |
    | `game-finished` | Partie bereits beendet (Fenster abgelaufen/regulär) → es folgt terminales `game:over` (FR-017) |
- **Effekt bei Erfolg**: `socket.join(code)`, `socket.data.lobby = { code, you }`,
  `seat.connected=true`, `seat.reconnectDeadline=null`, Grace-Timer des Sitzes gelöscht. Sind danach
  **beide** Sitze verbunden → Zug-Timer mit `pausedTurnRemainingMs` neu bewaffnet.

---

## Neue Server → Client Events

### `opponent:disconnected` (Broadcast an Raum)
```ts
interface OpponentDisconnectedMsg {
  code: string;
  playerId: 'A' | 'B';      // wer getrennt ist
  graceDeadline: number;    // absolute ms-Deadline des 60-s-Fensters (für Countdown)
}
```
> Der verbliebene Client zeigt „Gegner getrennt – wartet (xx s)"; der Countdown wird clientseitig
> aus `graceDeadline` berechnet (gleiche Logik wie `turnDeadline`). FR-007.

### `opponent:reconnected` (Broadcast an Raum)
```ts
interface OpponentReconnectedMsg { code: string; playerId: 'A' | 'B'; }
```
> Hinweis entfernen; Partie läuft weiter. FR-010.

### `turn:changed` (reason-Union erweitert)
```ts
reason: 'shot' | 'miss' | 'timeout' | 'extra-turn' | 'start' | 'resume';
```
> `'resume'` wird beim Fortsetzen nach Reconnect mit der neuen `turnDeadline` (= now + Restzeit)
> gesendet. FR-012.

### `game:over` (unverändert)
`reason: 'all-sunk' | 'forfeit'` — Aufgabe durch Fenster-Ablauf nutzt `'forfeit'`.

---

## Server-Autoritäts-Invarianten (zusätzlich zu 004; Tests leiten sich hieraus ab)

1. **Wiederherstellung leakt nicht**: Kein durch `reconnect:resume` ausgelöstes Event enthält
   ungetroffene gegnerische Schiffszellen (SC-002) — Projektion ausschließlich über `viewFor`.
2. **Timer-Pause**: Während `paused` läuft kein Zug-Timer ab; nach Resume entspricht `turnDeadline`
   der Restzeit zum Trennungszeitpunkt (±1 s, SC-004).
3. **Genau eine Wertung**: Grace-Ablauf wertet höchstens einmal (status-Guard + `matchKey`); zwei
   Grace-Timer (beide getrennt) ⇒ erstes Fenster entscheidet, eine Wertung (FR-014a/FR-016).
4. **Token-Härte**: `reconnect:resume` mit falschem/fremdem Token (und ohne passende User-Identität)
   → `forbidden`, Sitz unverändert (FR-002/SC-007).
5. **Regulär schlägt Aufgabe**: Endet die Partie regulär gleichzeitig mit einem Disconnect, gilt das
   reguläre `game:over(all-sunk)` (FR-019).
