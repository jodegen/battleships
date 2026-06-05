# Quickstart: `@schiffe/engine` (Meilenstein 1)

Framework-unabhängige TypeScript-Engine für „Schiffe versenken" — reine, deterministische
Funktionen, getestet mit Vitest. Kein UI, kein Backend.

## Voraussetzungen

- Node.js (LTS) für Toolchain/Tests. Die Engine selbst läuft in jeder JS-Umgebung (Node,
  Browser) ohne Laufzeitabhängigkeiten.

## Setup

```bash
# im Repo-Root (Workspace)
npm install              # installiert Dev-Toolchain (TypeScript, Vitest, ESLint, Prettier)

# Tests (TDD – zuerst rot, dann grün)
npm --workspace packages/engine run test         # einmalig
npm --workspace packages/engine run test:watch    # Watch-Modus

# Qualität (CI-Gate, Verfassung Prinzip IV)
npm --workspace packages/engine run lint
npm --workspace packages/engine run typecheck     # tsc --noEmit (strict)
npm --workspace packages/engine run build         # tsc → dist/ (ESM + .d.ts)
```

## Minimalbeispiel: vollständige Partie gegen die KI

```ts
import {
  defineConfig, createRng, generateFleet, createGame,
  applyShot, selectMove, isOver, getWinner, currentTurn,
} from '@schiffe/engine';

// Deterministisch: gleicher Seed -> gleicher Spielverlauf
const rng = createRng(12345);
const config = defineConfig({ allowTouching: false }); // 10x10, klassische Flotte, Extrazug an

// Beide Flotten regelkonform generieren (FR-030)
const a = generateFleet(config, rng);
const b = generateFleet(config, rng);
if (!a.ok || !b.ok) throw new Error('Aufstellung nicht möglich');

let state = createGame(config, { A: a.ships, B: b.ships });

// Spieler A = Mensch/extern, Spieler B = schwere KI
while (!isOver(state)) {
  const turn = currentTurn(state);
  const level = 'density' as const;
  const decision = selectMove(state, turn, turn === 'B' ? level : 'random', rng);
  if ('noMove' in decision) break;

  const res = applyShot(state, turn, decision.move);
  if ('rejected' in res) continue; // ungültiger Zug verändert nichts (FR-014/015)
  state = res.state;               // neuer, unveränderlicher Zustand
}

console.log('Sieger:', getWinner(state)); // 'A' | 'B'
```

## Was dieses Beispiel demonstriert

- **US1**: `generateFleet`/`validatePlacement` erzeugen/prüfen regelkonforme Aufstellungen inkl.
  Berührungsregel.
- **US2**: `applyShot` wertet Schüsse aus, setzt Zugrecht (Extrazug bei Treffer) und erkennt den
  Sieger.
- **US3**: `selectMove` liefert KI-Züge in drei Stufen.
- **Determinismus**: identischer Seed → identischer Verlauf (FR-028, SC-007/008).

## Akzeptanz schnell prüfen

| Spec | Prüfung |
|------|---------|
| FR-009/010 (Berührung) | `validatePlacement` mit/ohne `allowTouching` |
| FR-013–FR-018, FR-031 | `applyShot`-Ergebnisse (miss/hit/sunk + Länge) |
| FR-016/017 (Extrazug) | `currentTurn` vor/nach Treffer bzw. Fehlschuss |
| FR-019 (Sieg) | `isOver`/`getWinner` nach Versenken aller Schiffe |
| FR-021 (Fog of War) | `viewFor` enthält keine verdeckten Gegnerpositionen |
| SC-006 (KI-Stärke) | Selfplay-Serie: Schussanzahl density < hunt-target < random |
