# @schiffe/engine

Framework-unabhängige, deterministische Spiel-Engine & KI für „Schiffe versenken" —
die **Single Source of Truth** für die Spielregeln (Verfassung Prinzip III). Reine
TypeScript-Funktionen ohne UI-, Netzwerk- oder Persistenz-Abhängigkeiten (0 Runtime-deps),
damit ein Server später autoritativ mit exakt derselben Logik validieren kann.

## Eigenschaften

- **Server-autoritativ nutzbar**: trifft alle regelrelevanten Entscheidungen selbst; `viewFor`
  liefert eine Fog-of-War-Sicht, die verdeckte Gegnerpositionen nie offenlegt.
- **Deterministisch**: jeglicher Zufall wird über eine injizierte `Rng` bezogen (`createRng(seed)`)
  — kein `Math.random`, kein `Date.now`. Gleicher Seed → gleicher Verlauf.
- **Unveränderlich**: Operationen geben neue Zustände zurück, Eingaben bleiben unberührt.

## Öffentliche API (Überblick)

| Bereich | Exporte |
|---------|---------|
| Konfiguration | `DEFAULT_CONFIG`, `defineConfig`, `CLASSIC_FLEET` |
| Zufall | `createRng`, Typ `Rng` |
| Platzierung (US1) | `validatePlacement`, `generateFleet` |
| Spielschleife (US2) | `createGame`, `applyShot`, `currentTurn`, `isOver`, `getWinner`, `viewFor` |
| KI (US3) | `selectMove` (Stufen `'random' | 'hunt-target' | 'density'`) |

Der vollständige, verbindliche Contract liegt unter
`specs/001-engine-ai-core/contracts/public-api.md`; ein Einstieg in
`specs/001-engine-ai-core/quickstart.md`.

## Befehle

```bash
npm --workspace packages/engine run test       # Vitest (TDD)
npm --workspace packages/engine run test:watch
npm --workspace packages/engine run typecheck  # tsc --noEmit (strict)
npm --workspace packages/engine run lint        # ESLint (kein any, kein Math.random/Date.now)
npm --workspace packages/engine run build       # tsc → dist/ (ESM + .d.ts)
```

## Schnellbeispiel

```ts
import { defineConfig, createRng, generateFleet, createGame, applyShot, selectMove, isOver, getWinner, currentTurn } from '@schiffe/engine';

const rng = createRng(12345);
const config = defineConfig({ allowTouching: false });
const a = generateFleet(config, rng);
const b = generateFleet(config, rng);
if (!a.ok || !b.ok) throw new Error('Aufstellung nicht möglich');

let state = createGame(config, { A: a.ships, B: b.ships });
while (!isOver(state)) {
  const turn = currentTurn(state);
  const d = selectMove(state, turn, 'density', rng);
  if ('noMove' in d) break;
  const res = applyShot(state, turn, d.move);
  if ('rejected' in res) continue;
  state = res.state;
}
console.log('Sieger:', getWinner(state));
```
