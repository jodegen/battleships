# Phase 1 Data Model: Minimal spielbares Frontend gegen die KI

Das Modell beschreibt den **UI-Zustand** (Frontend), nicht die Spielregeln — letztere leben in
`@schiffe/engine`. Alle spiellogischen Werte (Board, GameState, ShotResult, PlayerView, AiLevel)
werden aus dem Engine-Paket importiert und hier nur referenziert/gehalten. Der UI-Zustand ist
unveränderlich; der Session-Controller liefert neue Zustände zurück.

## Aus der Engine referenziert (nicht neu definiert)

- `GameConfig`, `GameState`, `Board`, `ShipPlacement`, `Coord`, `Orientation`
- `ShotResult` (`miss | hit | sunk`, `sunkShip?`), `PlayerView`, `PlayerId`
- `AiLevel` (`'random' | 'hunt-target' | 'density'`), `Rng`

## UI-Entitäten

### Difficulty
- Abbildung der drei Stufen auf `AiLevel`:
  - `'leicht' → 'random'`, `'mittel' → 'hunt-target'`, `'schwer' → 'density'`.
- **Validierung**: genau eine Stufe gewählt, bevor `startGame` möglich ist (FR-009).

### Phase
- Aufzählung des UI-Lebenszyklus: `'difficulty' | 'placing' | 'playing' | 'finished'`.
- **Übergänge** (siehe Statemachine in `contracts/session-controller.md`):
  - `difficulty → placing` (Stufe gewählt),
  - `placing → playing` (gültige, vollständige Flotte → `startGame`),
  - `playing → finished` (Engine meldet Sieger),
  - `finished → difficulty` (`restart`).

### PlacementDraft
- `ships: ShipPlacement[]` — bisher gesetzte eigene Schiffe.
- `pending?: { length: number }` — als nächstes zu platzierendes Schiff (aus der Soll-Flotte).
- `selectedIndex?: number` — aktuell ausgewähltes Schiff (für Drehen/Verschieben).
- **Abgeleitet**:
  - `isComplete`: `validatePlacement(config, ships).ok === true` (vollständige, gültige Flotte).
  - `canPlaceAt(ship)`: Probeplatzierung wird via Engine geprüft, bevor sie übernommen wird.
- **Validierung**: jede Übernahme nur, wenn die resultierende Teil-/Gesamtaufstellung von der
  Engine akzeptiert wird (FR-006); Drehen nur, wenn das Schiff im Raster bleibt (FR-005).

### SessionState (Wurzel des UI-Zustands)
- `phase: Phase`
- `config: GameConfig` — Engine-Default (10×10, klassische Flotte, Berührung erlaubt, Extrazug an).
- `difficulty: Difficulty | null`
- `seed: number` — für die Partie gewählter Seed (Engine bleibt deterministisch).
- `draft: PlacementDraft` — relevant in Phase `placing`.
- `game: GameState | null` — der autoritative Engine-Spielzustand ab Phase `playing`.
- `turn: PlayerId | null` — gespiegelt aus `game` (wer am Zug ist, FR-014).
- `lastShot?: { by: PlayerId; result: ShotResult }` — für Anzeige/Feedback.
- `outcome?: 'won' | 'lost'` — in Phase `finished` (abgeleitet aus `getWinner`).
- **Invarianten**:
  - In `playing`/`finished` ist `game` gesetzt; in `difficulty`/`placing` ist `game === null`.
  - Eingaben außerhalb der jeweils erlaubten Phase verändern den Zustand nicht (FR-013/016).

### CellView (Darstellungsableitung, kein gespeicherter Zustand)
- Pro Board-Zelle ein Darstellungswert, abgeleitet aus `viewFor(game, player)`:
  - eigenes Board: `'water' | 'ship' | 'hit' | 'sunk' | 'miss'`,
  - Gegnerboard: `'unknown' | 'miss' | 'hit' | 'sunk'` (nie verdeckte Schiffe).
- **Invariante (FR-002)**: Für das Gegnerboard existiert kein `'ship'`-Zustand für nicht
  getroffene Felder — die Darstellung erhält diese Information gar nicht.

## Querbezüge zu Anforderungen

| Entität | Deckt FR ab |
|---------|-------------|
| Difficulty | FR-009 |
| Phase / SessionState | FR-008, FR-011, FR-013, FR-014, FR-015, FR-016, FR-017 |
| PlacementDraft | FR-003, FR-004, FR-005, FR-006, FR-007, FR-008 |
| CellView (aus `viewFor`) | FR-002, FR-010, FR-012 |
| seed / Engine-Aufrufe | FR-001 (alle Logik via Engine), FR-018 (clientseitig) |
