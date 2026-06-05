'use client';

import { coordKey, shipCells, type Orientation, type ShipPlacement } from '@schiffe/engine';
import { useMemo, useState } from 'react';
import type { GameSession } from '@/hooks/useGameSession';

/** Liefert die noch zu platzierenden Schiffslängen (Soll-Flotte minus bereits platzierte). */
function remainingLengths(session: GameSession): number[] {
  const target = new Map<number, number>();
  for (const s of session.state.config.fleet.ships) target.set(s.length, s.count);
  for (const s of session.state.draft.ships) target.set(s.length, (target.get(s.length) ?? 0) - 1);
  const out: number[] = [];
  for (const [length, count] of target) for (let i = 0; i < count; i++) out.push(length);
  return out.sort((a, b) => b - a);
}

function shipIndexAt(session: GameSession, x: number, y: number): number {
  return session.state.draft.ships.findIndex((s) =>
    shipCells(s).some((c) => c.x === x && c.y === y),
  );
}

export function PlacementBoard({ session }: { session: GameSession }): JSX.Element {
  const { state } = session;
  const { width, height } = state.config.board;
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  const remaining = useMemo(() => remainingLengths(session), [session]);
  const activeLength = remaining[0];

  const placedKeys = useMemo(() => {
    const m = new Map<string, number>();
    state.draft.ships.forEach((s, i) => {
      for (const c of shipCells(s)) m.set(coordKey(c), i);
    });
    return m;
  }, [state.draft.ships]);

  const previewKeys = useMemo(() => {
    if (activeLength === undefined || !hover) return new Set<string>();
    const ship: ShipPlacement = { length: activeLength, origin: hover, orientation };
    if (!session.canPlaceShip(ship)) return new Set<string>();
    return new Set(shipCells(ship).map(coordKey));
  }, [activeLength, hover, orientation, session]);

  function handleCell(x: number, y: number): void {
    const existing = shipIndexAt(session, x, y);
    if (existing >= 0) {
      session.rotateShip(existing); // platziertes Schiff drehen (oder unverändert, falls ungültig)
      return;
    }
    if (activeLength === undefined) return;
    session.placeShip({ length: activeLength, origin: { x, y }, orientation });
  }

  function cellClass(x: number, y: number): string {
    const key = coordKey({ x, y });
    if (placedKeys.has(key)) return 'cell ship';
    if (previewKeys.has(key)) return 'cell preview';
    return 'cell water';
  }

  return (
    <section>
      <h2>Flotte platzieren</h2>
      <p>
        {activeLength !== undefined
          ? `Als Nächstes: Schiff der Länge ${activeLength} (${orientation === 'horizontal' ? 'horizontal' : 'vertikal'})`
          : 'Flotte vollständig.'}
      </p>
      <div className="row">
        <button
          type="button"
          onClick={() => setOrientation((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
        >
          Drehen
        </button>
        <button type="button" onClick={() => session.autoPlace()}>
          Zufällig platzieren
        </button>
        <button type="button" disabled={!session.canStart()} onClick={() => session.startGame()}>
          Spiel starten
        </button>
      </div>
      <div
        className="board"
        role="grid"
        aria-label="Platzierungsfeld"
        style={{ gridTemplateColumns: `repeat(${width}, 1.6rem)` }}
        onPointerLeave={() => setHover(null)}
      >
        {Array.from({ length: height }, (_, y) =>
          Array.from({ length: width }, (_, x) => (
            <button
              key={`${x},${y}`}
              type="button"
              role="gridcell"
              className={cellClass(x, y)}
              aria-label={`Feld ${x},${y}`}
              onPointerEnter={() => setHover({ x, y })}
              onClick={() => handleCell(x, y)}
            />
          )),
        )}
      </div>
    </section>
  );
}
