# Phase 1 — Data Model: Quick Play – öffentliches Matchmaking

**Keine Prisma-Migration. Kein neues Feld im `LobbyRecord`.** Quick Play fügt ausschließlich
**flüchtige Redis-Strukturen** für die Warteschlange + einen konto-weiten Aktiv-Index hinzu und nutzt
für die eigentliche Partie die **bestehenden** Typen (`LobbyRecord`, `LobbySettings`, `Seat`) unverändert.

## 1. Reine Logik (framework-/Redis-frei, TDD)

### 1.1 `quick-play-settings.ts`

```ts
import type { LobbySettings } from '../realtime/events';

/** Standard-Einstellungen für Quick-Play-Partien (FR-005). */
export const QUICK_PLAY_SETTINGS: LobbySettings = {
  allowTouching: true,      // Berührung erlaubt
  turnTimerSeconds: 30,     // Standard-Zug-Timer (events.ts/app-config Default)
  extraTurnOnHit: true,     // Treffer = Extrazug
};
```

### 1.2 `queue-guard.ts` — Zulassungsprädikat (FR-001/015)

```ts
import type { Identity } from '../auth/identity';
import type { ErrorCode } from '../realtime/events';

export interface QueueContext {
  readonly inLobby: boolean;       // socket.data.lobby gesetzt?
  readonly hasActiveGame: boolean; // game-of-user:{userId} existiert?
}

export type GuardResult = { readonly ok: true } | { readonly ok: false; readonly error: ErrorCode };

/** Rein, deterministisch, ohne I/O — vollständig unit-testbar. */
export function canEnterQueue(identity: Identity, ctx: QueueContext): GuardResult {
  if (identity.kind === 'guest') return { ok: false, error: 'forbidden' };       // FR-001
  if (identity.kind === 'anonymous') return { ok: false, error: 'unauthenticated' };
  if (ctx.inLobby || ctx.hasActiveGame) return { ok: false, error: 'already-in-game' }; // FR-015
  return { ok: true };
}
```

**Validierungsregeln (Tests leiten sich direkt ab)**:
- Gast → `forbidden`; anonym → `unauthenticated`.
- Eingeloggt **und** bereits in Lobby/Partie → `already-in-game`.
- Eingeloggt **und** frei → `ok`.

## 2. Flüchtige Redis-Entitäten (Phase Queue)

### 2.1 Warteschlange — `quickplay:queue` (ZSET)

| Aspekt | Wert |
|--------|------|
| Typ | Sorted Set |
| Member | `userId` (eingeloggter Spieler — **ein** Eintrag pro Konto, FR-011) |
| Score | `enqueuedAt` (ms; First-come-Reihenfolge, FR-004) |
| Schreiben | atomar via Lua `claim-or-enqueue` (siehe contracts/redis-state.md) |
| Entfernen | `ZREM` bei Match (Gegner), Cancel (FR-008), Disconnect (FR-013), Timeout (FR-016) |
| Lebensdauer | so lange ein User wartet; pro Eintrag kein eigener TTL (Liveness über Disconnect/Timeout) |

**Lebenszyklus eines Wartelisten-Eintrags**:
```
(kein Eintrag) --queue:join (kein Gegner)--> wartend
wartend --queue:join eines anderen / claim--> entfernt → gepaart (Lobby entsteht)
wartend --queue:leave / disconnect / 120-s-Timeout--> entfernt (kein Match, kein Stat)
```

### 2.2 Warte-Socket-Zuordnung — `quickplay:conn:{userId}` (String)

| Aspekt | Wert |
|--------|------|
| Wert | `socketId` des wartenden Sockets (Single-Instance-Auflösung, research.md §5) |
| TTL | kurz (z. B. = `matchmakingTimeoutMs` + Puffer); wird beim Verlassen/Match gelöscht |
| Zweck | beim Match den **wartenden** Gegner-Socket lokal finden (`server.sockets.sockets.get`) |

### 2.3 Konto-weiter Aktiv-Index — `game-of-user:{userId}` (String)

| Aspekt | Wert |
|--------|------|
| Wert | `code` der Lobby/Partie, in der der eingeloggte Spieler sitzt |
| Gesetzt von | `LobbyService.createLobby` (Host) **und** `joinLobby` (eingeloggter Seat B) — Code- **und** Quick-Play-Lobby |
| Gelöscht von | `finishAndPersist` (Ende/Aufgabe), `removeBeforeStart`/`leave` (Vor-Spielstart-Austritt) |
| TTL | `ACTIVE_TTL_MS` (~2 h, wie Lobby-State) — Selbstheilung bei verwaisten Keys |
| Zweck | FR-015-Prüfung konto-weit/jedes Gerät, beide Sitze (research.md §3) |

> Hinweis: Das bestehende `open-lobbies:{userId}` (Set) bleibt **unverändert** für das Erstell-Limit
> (FR-006b) zuständig und erfasst nur Hosts. Es wird hier **nicht** umgewidmet.

## 3. Wiederverwendete bestehende Entitäten (unverändert)

| Entität | Quelle | Nutzung in Quick Play |
|---------|--------|------------------------|
| `LobbyRecord` (+ `Seat`) | `lobby/lobby-types.ts` | per `createLobby`+`joinLobby` erzeugt; **kein** Delta |
| `LobbySettings` | `realtime/events.ts` | `QUICK_PLAY_SETTINGS` |
| `reconnectToken` (pro Seat) | 005 | im `queue:matched`-Ack an den jeweiligen Spieler → Reconnect identisch |
| `Match` / `MatchMove` / `Stat` (Prisma) | `persistence/` | identische Persistenz via `finishAndPersist` — **keine** Migration |

## 4. Konfiguration (additiv)

`AppConfig` erhält:

```ts
/** Wartetimeout der Quick-Play-Suche in ms (FR-016). Default 120_000. */
readonly matchmakingTimeoutMs: number; // intFromEnv(env, 'MATCHMAKING_TIMEOUT_MS', 120_000)
```

## 5. Zustandsübersicht (Spieler-Sicht)

```
        queue:join (ok, kein Gegner)
idle ───────────────────────────────► searching ──────────────┐
  ▲                                       │ queue:matched        │ queue:leave / disconnect / timeout
  │                                       ▼                      ▼
  │                                    placing ───► in_progress ─► finished   (BESTEHENDER Pfad, unverändert)
  └──────────────── (kein Match: queue:timeout → „kein Match gefunden", erneut möglich) ◄┘
```
