'use client';

import { createRng, type Coord, type Rng, type ShipPlacement } from '@schiffe/engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as ctrl from '@/session/controller';
import type { Difficulty, SessionState } from '@/session/types';

/** Verzögerung zwischen aufeinanderfolgenden KI-Schüssen (FR-020), damit Serien sichtbar sind. */
export const AI_DELAY_MS = 400;

export interface GameEndResult {
  resultId: string;
  outcome: 'won' | 'lost';
}

export interface GameSessionOptions {
  /** Wird genau einmal pro beendeter Partie aufgerufen (Ergebnis-Meldung, FR-019/020). */
  onGameEnd?: (result: GameEndResult) => void;
  /** Erzeugt die partie-stabile resultId; injizierbar für deterministische Tests. */
  makeResultId?: () => string;
}

function defaultResultId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return `r-${String(Date.now())}-${String(Math.floor(Math.random() * 1e9))}`;
}

export interface GameSession {
  state: SessionState;
  chooseDifficulty: (d: Difficulty) => void;
  placeShip: (ship: ShipPlacement) => void;
  rotateShip: (index: number) => void;
  removeShip: (index: number) => void;
  autoPlace: () => void;
  canPlaceShip: (ship: ShipPlacement) => boolean;
  canStart: () => boolean;
  startGame: () => void;
  shoot: (target: Coord) => void;
  restart: () => void;
}

export function useGameSession(
  initialSeed: number,
  delayMs: number = AI_DELAY_MS,
  options: GameSessionOptions = {},
): GameSession {
  const { onGameEnd, makeResultId = defaultResultId } = options;
  const [state, setState] = useState<SessionState>(() => ctrl.createSession(initialSeed));
  const rngRef = useRef<Rng>(createRng(initialSeed));
  const seedRef = useRef<number>(initialSeed);
  const reportedRef = useRef<boolean>(false);

  // KI-Züge zeitgesteuert abspielen: bei jedem Zustandswechsel prüfen, ob die KI dran ist.
  useEffect(() => {
    if (!ctrl.isAiTurn(state)) return;
    const timer = setTimeout(() => {
      setState((s) => ctrl.aiStep(s, rngRef.current));
    }, delayMs);
    return () => clearTimeout(timer);
  }, [state, delayMs]);

  // Ergebnis-Meldung: genau einmal pro beendeter Partie (FR-019/020).
  useEffect(() => {
    if (state.phase === 'finished' && state.outcome && state.resultId && !reportedRef.current) {
      reportedRef.current = true;
      onGameEnd?.({ resultId: state.resultId, outcome: state.outcome });
    }
  }, [state, onGameEnd]);

  const chooseDifficulty = useCallback((d: Difficulty) => {
    setState((s) => ctrl.chooseDifficulty(s, d));
  }, []);

  const placeShip = useCallback((ship: ShipPlacement) => {
    setState((s) => ctrl.placeShip(s, ship));
  }, []);

  const rotateShip = useCallback((index: number) => {
    setState((s) => ctrl.rotateShip(s, index));
  }, []);

  const removeShip = useCallback((index: number) => {
    setState((s) => ctrl.removeShip(s, index));
  }, []);

  const autoPlace = useCallback(() => {
    setState((s) => ctrl.autoPlace(s, rngRef.current));
  }, []);

  const canPlaceShip = useCallback((ship: ShipPlacement) => ctrl.canPlaceShip(state, ship), [state]);
  const canStart = useCallback(() => ctrl.canStart(state), [state]);

  const startGame = useCallback(() => {
    const resultId = makeResultId();
    setState((s) => ctrl.startGame(s, rngRef.current, resultId));
  }, [makeResultId]);

  const shoot = useCallback((target: Coord) => {
    setState((s) => ctrl.playerShoot(s, target).next);
  }, []);

  const restart = useCallback(() => {
    const nextSeed = (seedRef.current + 0x9e3779b1) >>> 0;
    seedRef.current = nextSeed;
    rngRef.current = createRng(nextSeed);
    reportedRef.current = false;
    setState(ctrl.restart(nextSeed));
  }, []);

  return {
    state,
    chooseDifficulty,
    placeShip,
    rotateShip,
    removeShip,
    autoPlace,
    canPlaceShip,
    canStart,
    startGame,
    shoot,
    restart,
  };
}
