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
  type ShipPlacement,
  type ShotResultMsg,
  type TurnChangedMsg,
} from './socket-client';

let moveSeq = 0;
const nextMoveId = (): string => `mv-${Date.now()}-${moveSeq++}`;

export interface OnlineGameState {
  connected: boolean;
  lobby: LobbyView | null;
  view: GameViewMsg | null;
  turnDeadline: number | null;
  lastShot: ShotResultMsg | null;
  over: GameOverMsg | null;
  error: string | null;
}

export interface OnlineGameApi extends OnlineGameState {
  createLobby: (settings: LobbySettings) => Promise<string | null>;
  joinLobby: (code: string, guestName?: string) => Promise<boolean>;
  placeFleet: (placements: ShipPlacement[]) => Promise<boolean>;
  fireShot: (target: Coord) => Promise<boolean>;
  leave: () => void;
}

export function useOnlineGame(): OnlineGameApi {
  const socketRef = useRef<Socket | null>(null);
  const codeRef = useRef<string | null>(null);
  const [state, setState] = useState<OnlineGameState>({
    connected: false,
    lobby: null,
    view: null,
    turnDeadline: null,
    lastShot: null,
    over: null,
    error: null,
  });

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;
    const patch = (p: Partial<OnlineGameState>): void => setState((s) => ({ ...s, ...p }));

    socket.on('connect', () => patch({ connected: true }));
    socket.on('disconnect', () => patch({ connected: false }));
    socket.on('lobby:state', (lobby: LobbyView) => patch({ lobby }));
    socket.on('game:view', (view: GameViewMsg) => patch({ view, turnDeadline: view.turnDeadline }));
    socket.on('shot:result', (msg: ShotResultMsg) => patch({ lastShot: msg }));
    // turn:changed aktualisiert nur die Deadline; der „am Zug"-Status kommt über game:view.
    socket.on('turn:changed', (msg: TurnChangedMsg) => patch({ turnDeadline: msg.turnDeadline }));
    socket.on('game:over', (over: GameOverMsg) => patch({ over }));
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
      const ack = await emit<{ code: string; lobby: LobbyView }>('lobby:create', { settings });
      if (!ack.ok) {
        setState((s) => ({ ...s, error: ack.error }));
        return null;
      }
      codeRef.current = ack.code;
      setState((s) => ({ ...s, lobby: ack.lobby, error: null }));
      return ack.code;
    },
    [emit],
  );

  const joinLobby = useCallback(
    async (code: string, guestName?: string): Promise<boolean> => {
      const ack = await emit<{ lobby: LobbyView }>('lobby:join', { code, guestName });
      if (!ack.ok) {
        setState((s) => ({ ...s, error: ack.error }));
        return false;
      }
      codeRef.current = ack.lobby.code;
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

  const leave = useCallback((): void => {
    const code = codeRef.current;
    if (code) void socketRef.current?.emit('lobby:leave', { code });
    codeRef.current = null;
  }, []);

  return { ...state, createLobby, joinLobby, placeFleet, fireShot, leave };
}
