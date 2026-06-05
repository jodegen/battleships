# Phase 1 Data Model: Spiel-Engine & KI (Meilenstein 1)

Domänenmodell der Engine. Alle Strukturen sind unveränderliche Datenobjekte; Operationen sind
reine Funktionen, die neue Werte zurückgeben (siehe `contracts/public-api.md`). Typnamen sind
indikativ für die Implementierung.

## Werteinheiten

### Coord
- `x: number` — Spalte, 0-basiert, `0 ≤ x < width`.
- `y: number` — Zeile, 0-basiert, `0 ≤ y < height`.
- **Validierung**: „in-bounds" gemäß `GameConfig.board` (FR-004).

### Orientation
- Aufzählung: `'horizontal' | 'vertical'` (FR-005).

### PlayerId
- Aufzählung: `'A' | 'B'` — die beiden Parteien.

## Konfiguration

### BoardSize
- `width: number` (Standard 10), `height: number` (Standard 10) (FR-001).
- **Validierung**: positive ganze Zahlen.

### FleetSpec
- Liste von `{ length: number; count: number }`.
- **Default (klassische Flotte, FR-002)**: `[{length:5,count:1},{length:4,count:1},
  {length:3,count:3},{length:2,count:1}]` (entspricht 1×5, 1×4, 2×3 Zerstörer + 1×3 U-Boot, 1×2).
- **Validierung**: alle `length ≥ 1`, alle `count ≥ 1`; Summe der Zellen ≤ Feldfläche.

### GameConfig (Spielregeln-Konfiguration)
- `board: BoardSize`
- `fleet: FleetSpec`
- `allowTouching: boolean` — Standard `true` (FR-003, FR-009/010).
- `extraTurnOnHit: boolean` — Standard `true` (FR-003, FR-016/017).
- **Validierung**: in sich konsistent; mit `allowTouching=false` muss zumindest eine gültige
  Aufstellung theoretisch möglich sein (sonst meldet der Generator „nicht platzierbar").

## Spielobjekte

### Ship
- `length: number`
- `origin: Coord` — Ankerzelle (oberste/linkeste belegte Zelle).
- `orientation: Orientation`
- **Abgeleitet**: `cells(): Coord[]` — die belegten Zellen (FR-005).
- **Validierung**: alle Zellen in-bounds (FR-006).

### Board (eine Partei)
- `size: BoardSize`
- `ships: Ship[]` — die eigene Flotte.
- `shotsReceived: Set<Coord>` — auf dieses Board abgegebene Schüsse (vom Gegner).
- **Abgeleitet/Invarianten**:
  - keine zwei Schiffe überlappen (FR-007);
  - Flotte == `GameConfig.fleet` (Anzahl/Längen) für „gültig & vollständig" (FR-008, FR-012);
  - bei `allowTouching=false`: paarweiser Mindestabstand ≥ 1 (8er-Nachbarschaft) (FR-009).
- **Schiffsstatus** (abgeleitet aus `shotsReceived`): eine Schiffszelle ist *getroffen*, wenn
  sie in `shotsReceived` liegt; ein Schiff ist *versenkt*, wenn alle seine Zellen getroffen
  sind (FR-018).

### PlacementResult
- `ok: true` **oder** `ok: false; reason: PlacementError`.
- `PlacementError`: `'out-of-bounds' | 'overlap' | 'touching-forbidden' | 'fleet-mismatch' |
  'invalid-orientation'` (FR-011).

### ShotResult
- `outcome: 'miss' | 'hit' | 'sunk'` (FR-013).
- `coord: Coord`
- `sunkShip?: { length: number }` — nur bei `outcome === 'sunk'` (FR-031).
- **Ungültige Schüsse** liefern stattdessen einen Fehlerwert (siehe `ShotRejection`).

### ShotRejection
- `rejected: true; reason: 'already-shot' | 'out-of-bounds' | 'not-your-turn' | 'game-over'`
  (FR-014, FR-015). Verändert den Zustand nicht.

## Spielzustand

### GameState
- `config: GameConfig`
- `boards: { A: Board; B: Board }`
- `turn: PlayerId` — wer am Zug ist (FR-020).
- `status: 'placing' | 'in-progress' | 'finished'`
- `winner: PlayerId | null` (FR-019).
- **Lebenszyklus / State Transitions**:
  - `placing` → `in-progress`: sobald beide Boards gültige, vollständige Flotten haben
    (FR-012).
  - `in-progress` → `in-progress`: nach jedem gültigen Schuss; `turn` bleibt bei `hit`/`sunk`
    mit `extraTurnOnHit=true`, wechselt bei `miss` bzw. immer bei `extraTurnOnHit=false`
    (FR-016/017).
  - `in-progress` → `finished`: wenn alle Schiffe einer Partei versenkt sind; `winner` = die
    schießende Partei (FR-019). Kein Unentschieden möglich.
- **Invarianten**: im Status `finished` werden weitere Schüsse mit `'game-over'` abgelehnt;
  `turn`/`winner` bleiben stabil.

## Sicht (Fog of War)

### PlayerView (FR-021)
- `own: Board` — vollständige eigene Sicht (eigene Schiffe + erlittene Schüsse).
- `opponent: { shots: Array<{ coord: Coord; outcome: 'miss' | 'hit' | 'sunk'; sunkShip?: {
  length: number } }> }` — **nur** die Ergebnisse der eigenen Schüsse auf den Gegner; niemals
  nicht getroffene gegnerische Schiffspositionen.
- **Invariante**: aus einer `PlayerView` lässt sich keine verdeckte gegnerische Schiffsposition
  rekonstruieren.

## KI

### AiLevel
- Aufzählung: `'random' | 'hunt-target' | 'density'` (FR-022).

### AiObservation (Eingabe der KI)
- Entspricht der `PlayerView`-Perspektive der schießenden Partei: bekannte Schussergebnisse
  (miss/hit/sunk inkl. versenkter Längen, FR-031) + `config` (für Feldmaße, lebende Flotte,
  Berührungsregel). Enthält **keine** verdeckten gegnerischen Positionen (Prinzip I).

### AiDecision (Ausgabe der KI)
- `move: Coord` (in-bounds, unbeschossen — FR-023) **oder**
- `noMove: true` — kein gültiger Zug möglich (FR-027).
- **Determinismus**: bei identischer `AiObservation` und identischer RNG identisch (SC-007).

## Querbezüge zu Anforderungen

| Entität | Deckt FR ab |
|---------|-------------|
| GameConfig / BoardSize / FleetSpec | FR-001, FR-002, FR-003, FR-004 |
| Ship / Board / PlacementResult | FR-005–FR-012, FR-030 |
| ShotResult / ShotRejection | FR-013–FR-015, FR-018, FR-031 |
| GameState | FR-016, FR-017, FR-019, FR-020 |
| PlayerView | FR-021 |
| AiLevel / AiObservation / AiDecision | FR-022–FR-027, FR-032, FR-033 |
| RNG-Injektion (in Operationen) | FR-028, FR-029 |
