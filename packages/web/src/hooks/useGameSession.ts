'use client';

import { createRng, type Coord, type Rng, type ShipPlacement } from '@schiffe/engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as ctrl from '@/session/controller';
import type { Difficulty, SessionState } from '@/session/types';

/** Verzögerung zwischen aufeinanderfolgenden KI-Schüssen (FR-020), damit Serien sichtbar sind. */
export const AI_DELAY_MS = 400;

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

export function useGameSession(initialSeed: number, delayMs: number = AI_DELAY_MS): GameSession {
  const [state, setState] = useState<SessionState>(() => ctrl.createSession(initialSeed));
  const rngRef = useRef<Rng>(createRng(initialSeed));
  const seedRef = useRef<number>(initialSeed);

  // KI-Züge zeitgesteuert abspielen: bei jedem Zustandswechsel prüfen, ob die KI dran ist.
  useEffect(() => {
    if (!ctrl.isAiTurn(state)) return;
    const timer = setTimeout(() => {
      setState((s) => ctrl.aiStep(s, rngRef.current));
    }, delayMs);
    return () => clearTimeout(timer);
  }, [state, delayMs]);

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
    setState((s) => ctrl.startGame(s, rngRef.current));
  }, []);

  const shoot = useCallback((target: Coord) => {
    setState((s) => ctrl.playerShoot(s, target).next);
  }, []);

  const restart = useCallback(() => {
    const nextSeed = (seedRef.current + 0x9e3779b1) >>> 0;
    seedRef.current = nextSeed;
    rngRef.current = createRng(nextSeed);
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
