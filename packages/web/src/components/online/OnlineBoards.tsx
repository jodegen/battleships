'use client';

import { shipCells } from '@schiffe/engine';

import type { Coord, GameViewMsg } from '../../realtime/socket-client';

const SIZE = 10;
const key = (x: number, y: number): string => `${x},${y}`;

function cellStyle(bg: string): React.CSSProperties {
  return { width: 26, height: 26, border: '1px solid #99b', background: bg, fontSize: 12, lineHeight: '26px', textAlign: 'center', cursor: 'inherit' };
}

function Grid({ children }: { children: React.ReactNode }): JSX.Element {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(${SIZE}, 26px)`, gap: 1 }}>{children}</div>;
}

/**
 * Zwei Bretter: „Dein Brett" (eigene Schiffe + erlittene Schüsse) und „Angriff" (eigene
 * Schüsse auf den Gegner). Fog of War: es werden nur Server-Daten gezeigt — keine
 * ungetroffenen Gegnerschiffe (die kennt der Client nicht).
 */
export function OnlineBoards({
  view,
  canFire,
  onFire,
}: {
  view: GameViewMsg;
  canFire: boolean;
  onFire: (target: Coord) => void;
}): JSX.Element {
  const ownShipCells = new Set(view.own.ships.flatMap((s) => shipCells(s)).map((c) => key(c.x, c.y)));
  const incoming = new Map(view.own.shotsReceived.map((c) => [key(c.x, c.y), true]));
  const myShots = new Map(view.opponentShots.map((s) => [key(s.coord.x, s.coord.y), s.outcome]));

  const cells = (render: (x: number, y: number) => JSX.Element): JSX.Element[] => {
    const out: JSX.Element[] = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) out.push(render(x, y));
    return out;
  };

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <div>
        <h4>Dein Brett</h4>
        <Grid>
          {cells((x, y) => {
            const hit = incoming.has(key(x, y));
            const ship = ownShipCells.has(key(x, y));
            const bg = hit ? (ship ? '#e66' : '#cde') : ship ? '#8a8' : '#eef';
            return <div key={key(x, y)} style={cellStyle(bg)}>{hit ? (ship ? '✸' : '•') : ''}</div>;
          })}
        </Grid>
      </div>
      <div>
        <h4>Angriff</h4>
        <Grid>
          {cells((x, y) => {
            const outcome = myShots.get(key(x, y));
            const shot = outcome !== undefined;
            const bg = outcome === 'hit' || outcome === 'sunk' ? '#e66' : shot ? '#cde' : '#eef';
            const clickable = canFire && !shot;
            return (
              <div
                key={key(x, y)}
                role={clickable ? 'button' : undefined}
                aria-label={clickable ? `Schuss ${x},${y}` : undefined}
                onClick={clickable ? () => onFire({ x, y }) : undefined}
                style={{ ...cellStyle(bg), cursor: clickable ? 'pointer' : 'default' }}
              >
                {outcome === 'sunk' ? '☠' : outcome === 'hit' ? '✸' : shot ? '•' : ''}
              </div>
            );
          })}
        </Grid>
      </div>
    </div>
  );
}
