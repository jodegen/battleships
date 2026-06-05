import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../../app/page';

// Fake-Timer unterdrücken den verzögerten KI-Zug, damit Assertions deterministisch sind.
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function startGame(): void {
  fireEvent.click(screen.getByRole('button', { name: /Mittel/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Zufällig platzieren' }));
  fireEvent.click(screen.getByRole('button', { name: 'Spiel starten' }));
}

describe('Spielablauf (Komponente)', () => {
  it('zeigt nach dem Start „Du bist am Zug"', () => {
    render(<Page />);
    startGame();
    expect(screen.getByText(/Du bist am Zug/)).toBeInTheDocument();
  });

  it('das Gegnerfeld legt keine Schiffe offen (Fog of War, FR-002)', () => {
    render(<Page />);
    startGame();
    const enemy = within(screen.getByRole('grid', { name: 'Gegnerfeld' }));
    const cells = enemy.queryAllByRole('gridcell');
    expect(cells).toHaveLength(100);
    // Keine Gegnerzelle trägt die Schiffs-Klasse.
    expect(cells.some((c) => c.className.includes('ship'))).toBe(false);
  });

  it('ein Schuss markiert das Feld und sperrt es gegen erneuten Beschuss (FR-013)', () => {
    render(<Page />);
    startGame();
    const enemy = within(screen.getByRole('grid', { name: 'Gegnerfeld' }));
    const cell = enemy.getByLabelText(/Gegnerfeld 0,0/);
    expect(cell).toBeEnabled();
    fireEvent.click(cell);
    // Nach dem Schuss ist (0,0) kein 'unknown' mehr → Button gesperrt.
    expect(enemy.getByLabelText(/Gegnerfeld 0,0/)).toBeDisabled();
  });
});
