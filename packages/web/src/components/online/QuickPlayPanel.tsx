'use client';

// Quick-Play-Einstieg (006), bewusst schlicht: „Match suchen" → Wartestatus → Abbrechen.
// Nur für eingeloggte Spieler eingebunden (FR-001); der Übergang in die Partie erfolgt über
// `queue:matched` in `useOnlineGame` (kein eigener Spielpfad).

/** Sucheinstieg + Wartestatus für das öffentliche Matchmaking (FR-002/008/014/016). */
export function QuickPlayPanel({
  searching,
  noMatch,
  onFind,
  onCancel,
}: {
  searching: boolean;
  noMatch: boolean;
  onFind: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <section>
      <h3>Quick Play</h3>
      {searching ? (
        <>
          <p>Suche Gegner …</p>
          <button onClick={onCancel}>Abbrechen</button>
        </>
      ) : (
        <>
          <button onClick={onFind}>Match suchen</button>
          {noMatch && <p>Kein Match gefunden. Versuch es erneut.</p>}
        </>
      )}
    </section>
  );
}
