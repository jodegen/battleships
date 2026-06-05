'use client';

import { useEffect, useState } from 'react';

/** Countdown, clientseitig aus der serverseitig bestimmten Deadline berechnet (FR-020). */
export function TurnTimer({ deadline }: { deadline: number | null }): JSX.Element | null {
  const [remaining, setRemaining] = useState<number>(() =>
    deadline ? Math.max(0, deadline - Date.now()) : 0,
  );

  useEffect(() => {
    if (deadline === null) return;
    const tick = (): void => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  if (deadline === null) return null;
  return <span aria-label="Zug-Timer">⏱ {Math.ceil(remaining / 1000)} s</span>;
}
