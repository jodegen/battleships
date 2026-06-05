'use client';

// Hook für die Online-Partie: hält Verbindung + abgeleiteten Anzeige-Zustand aus den
// Server-Events. Der Client zeigt nur an und sendet Intents — der Server ist autoritativ.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import {
  type Ack,
  type Coord,
  createSocket,
  type GameOverMsg,
  type GameViewMsg,
  type LobbySettings,
  type LobbyView,
  type OpponentDisconnectedMsg,
  type PlayerId,
  type QueueMatchedMsg,
  type ShipPlacement,
  type ShotResultMsg,
  type TurnChangedMsg,
} from './socket-client';
import { clearReconnect, loadReconnect, saveReconnect } from './reconnect-store';

let moveSeq = 0;
const nextMoveId = (): string => `mv-${Date.now()}-${moveSeq++}`;

export interface OpponentDisconnect {
  playerId: PlayerId;
  graceDeadline: number;
}

export interface OnlineGameState {
  connected: boolean;
  /** Eigener Verbindungsabbruch — Auto-Reconnect läuft (005, FR-003). */
  selfReconnecting: boolean;
  lobby: LobbyView | null;
  view: GameViewMsg | null;
  turnDeadline: number | null;
  lastShot: ShotResultMsg | null;
  /** Gegner getrennt — Reconnect-Fenster mit Countdown (005, FR-007). */
  opponentDisconnect: OpponentDisconnect | null;
  over: GameOverMsg | null;
  error: string | null;
  /** Quick Play: Suche läuft (006, FR-002/014). */
  searching: boolean;
  /** Quick Play: Wartetimeout ohne Gegner (006, FR-016). */
  noMatch: boolean;
}

export interface OnlineGameApi extends OnlineGameState {
  createLobby: (settings: LobbySettings) => Promise<string | null>;
  joinLobby: (code: string, guestName?: string) => Promise<boolean>;
  placeFleet: (placements: ShipPlacement[]) => Promise<boolean>;
  fireShot: (target: Coord) => Promise<boolean>;
  /** Quick Play: Match suchen (006, FR-002). */
  findMatch: () => Promise<void>;
  /** Quick Play: Suche abbrechen (006, FR-008). */
  cancelSearch: () => void;
  leave: () => void;
}

export function useOnlineGame(): OnlineGameApi {
  const socketRef = useRef<Socket | null>(null);
  const codeRef = useRef<string | null>(null);
  const [state, setState] = useState<OnlineGameState>({
    connected: false,
    selfReconnecting: false,
    lobby: null,
    view: null,
    turnDeadline: null,
    lastShot: null,
    opponentDisconnect: null,
    over: null,
    error: null,
    searching: false,
    noMatch: false,
  });

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;
    const patch = (p: Partial<OnlineGameState>): void => setState((s) => ({ ...s, ...p }));

    socket.on('connect', () => {
      patch({ connected: true, selfReconnecting: false });
      // Nach (Wieder-)Verbinden automatisch in eine laufende Partie zurückkehren (005, FR-003/003a).
      const info = loadReconnect();
      if (info) {
        codeRef.current = info.code;
        socket.emit('reconnect:resume', { code: info.code, token: info.token });
      }
    });
    socket.on('disconnect', () => patch({ connected: false, selfReconnecting: true }));
    socket.on('lobby:state', (lobby: LobbyView) => patch({ lobby }));
    socket.on('game:view', (view: GameViewMsg) => patch({ view, turnDeadline: view.turnDeadline }));
    socket.on('shot:result', (msg: ShotResultMsg) => patch({ lastShot: msg }));
    // turn:changed aktualisiert nur die Deadline; der „am Zug"-Status kommt über game:view.
    socket.on('turn:changed', (msg: TurnChangedMsg) => patch({ turnDeadline: msg.turnDeadline }));
    socket.on('opponent:disconnected', (m: OpponentDisconnectedMsg) =>
      patch({ opponentDisconnect: { playerId: m.playerId, graceDeadline: m.graceDeadline } }),
    );
    socket.on('opponent:reconnected', () => patch({ opponentDisconnect: null }));
    // Quick Play: Paarung gefunden → wie ein erfolgreicher Beitritt in die bestehende Partie (006).
    socket.on('queue:matched', (msg: QueueMatchedMsg) => {
      codeRef.current = msg.code;
      saveReconnect({ code: msg.code, token: msg.reconnectToken, playerId: msg.you });
      patch({ lobby: msg.lobby, searching: false, noMatch: false, error: null });
    });
    socket.on('queue:timeout', () => patch({ searching: false, noMatch: true }));
    socket.on('game:over', (over: GameOverMsg) => {
      clearReconnect(); // Partie beendet → Reconnect-Token verwerfen (005)
      patch({ over, opponentDisconnect: null });
    });
    socket.on('error', (e: { error: string }) => patch({ error: e.error }));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const emit = useCallback(async <T,>(event: string, payload: unknown): Promise<Ack<T>> => {
    const socket = socketRef.current;
    if (!socket) return { ok: false, error: 'not-connected' } as Ack<T>;
    return (await socket.emitWithAck(event, payload)) as Ack<T>;
  }, []);

  const createLobby = useCallback(
    async (settings: LobbySettings): Promise<string | null> => {
      const ack = await emit<{ code: string; lobby: LobbyView; reconnectToken: string }>('lobby:create', { settings });
      if (!ack.ok) {
        setState((s) => ({ ...s, error: ack.error }));
        return null;
      }
      codeRef.current = ack.code;
      saveReconnect({ code: ack.code, token: ack.reconnectToken, playerId: 'A' });
      setState((s) => ({ ...s, lobby: ack.lobby, error: null }));
      return ack.code;
    },
    [emit],
  );

  const joinLobby = useCallback(
    async (code: string, guestName?: string): Promise<boolean> => {
      const ack = await emit<{ lobby: LobbyView; reconnectToken: string }>('lobby:join', { code, guestName });
      if (!ack.ok) {
        setState((s) => ({ ...s, error: ack.error }));
        return false;
      }
      codeRef.current = ack.lobby.code;
      saveReconnect({ code: ack.lobby.code, token: ack.reconnectToken, playerId: 'B' });
      setState((s) => ({ ...s, lobby: ack.lobby, error: null }));
      return true;
    },
    [emit],
  );

  const placeFleet = useCallback(
    async (placements: ShipPlacement[]): Promise<boolean> => {
      const code = codeRef.current;
      if (!code) return false;
      const ack = await emit('fleet:place', { code, placements });
      if (!ack.ok) setState((s) => ({ ...s, error: ack.error }));
      return ack.ok;
    },
    [emit],
  );

  const fireShot = useCallback(
    async (target: Coord): Promise<boolean> => {
      const code = codeRef.current;
      if (!code) return false;
      const ack = await emit('shot:fire', { code, moveId: nextMoveId(), target });
      if (!ack.ok) setState((s) => ({ ...s, error: ack.error }));
      return ack.ok;
    },
    [emit],
  );

  const findMatch = useCallback(async (): Promise<void> => {
    setState((s) => ({ ...s, searching: true, noMatch: false, error: null }));
    const ack = await emit<{ status: 'waiting' | 'matched' }>('queue:join', {});
    // Bei Erfolg bleibt `searching` aktiv, bis `queue:matched` eintrifft; nur Fehler beenden die Suche.
    if (!ack.ok) setState((s) => ({ ...s, searching: false, error: ack.error }));
  }, [emit]);

  const cancelSearch = useCallback((): void => {
    void socketRef.current?.emit('queue:leave', {});
    setState((s) => ({ ...s, searching: false, noMatch: false }));
  }, []);

  const leave = useCallback((): void => {
    const code = codeRef.current;
    if (code) void socketRef.current?.emit('lobby:leave', { code });
    clearReconnect();
    codeRef.current = null;
  }, []);

  return { ...state, createLobby, joinLobby, placeFleet, fireShot, findMatch, cancelSearch, leave };
}
