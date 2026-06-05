import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Page from '../../app/page';

function enterPlacing(): void {
  fireEvent.click(screen.getByRole('button', { name: /Mittel/ }));
}

describe('Platzierung (Komponente)', () => {
  it('„Spiel starten" ist gesperrt, bis eine gültige Flotte steht; „zufällig platzieren" schaltet frei', () => {
    render(<Page />);
    enterPlacing();
    expect(screen.getByRole('button', { name: 'Spiel starten' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zufällig platzieren' }));
    expect(screen.getByRole('button', { name: 'Spiel starten' })).toBeEnabled();
  });

  it('ein gültiger Klick platziert ein Schiff (nächste Länge ändert sich)', () => {
    render(<Page />);
    enterPlacing();
    expect(screen.getByText(/Länge 5/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Feld 0,0')); // Länge-5 horizontal ab (0,0) ist gültig
    expect(screen.getByText(/Länge 4/)).toBeInTheDocument();
  });

  it('eine ungültige Platzierung wird nicht übernommen', () => {
    render(<Page />);
    enterPlacing();
    // Länge 5 ab (9,0) horizontal ragt aus dem Feld → keine Platzierung.
    fireEvent.click(screen.getByLabelText('Feld 9,0'));
    expect(screen.getByText(/Länge 5/)).toBeInTheDocument();
  });

  it('Drehen wechselt die Ausrichtung', () => {
    render(<Page />);
    enterPlacing();
    expect(screen.getByText(/horizontal/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Drehen' }));
    expect(screen.getByText(/vertikal/)).toBeInTheDocument();
  });

  it('das Platzierungsfeld hat 100 Zellen', () => {
    render(<Page />);
    enterPlacing();
    const board = within(screen.getByRole('grid', { name: 'Platzierungsfeld' }));
    expect(board.queryAllByRole('gridcell').length).toBe(100);
  });
});
