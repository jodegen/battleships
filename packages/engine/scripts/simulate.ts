// Head-to-Head-Turnier der drei KI-Stufen. Spielt jede Stufe N-mal gegen jede andere
// (echte Partien über die Engine) und gibt die Siegquoten aus.
//
// Nutzung:  npm --workspace packages/engine run simulate [N]
//           (Standard N = 200; optional: 2. Argument = touching on|off)
//
// Erwartung: density > hunt-target > random. Zeigen die Quoten das nicht, stimmt die KI-Logik
// nicht (oder das Turnier ist statistisch zu klein).

import {
  applyShot,
  createGame,
  createRng,
  currentTurn,
  defineConfig,
  generateFleet,
  getWinner,
  isOver,
  selectMove,
  type AiLevel,
  type GameConfig,
  type PlayerId,
} from '../src/index';

const LEVELS: AiLevel[] = ['random', 'hunt-target', 'density'];
const LABEL: Record<AiLevel, string> = {
  random: 'Leicht (Zufall)',
  'hunt-target': 'Mittel (Hunt&Target)',
  density: 'Schwer (Dichte)',
};

/** Spielt eine vollständige Partie A vs. B und liefert den Sieger (oder null bei Abbruch). */
function playGame(config: GameConfig, aLevel: AiLevel, bLevel: AiLevel, seed: number): PlayerId | null {
  const rng = createRng(seed);
  const a = generateFleet(config, rng);
  const b = generateFleet(config, rng);
  if (!a.ok || !b.ok) return null;

  let state = createGame(config, { A: a.ships, B: b.ships });
  const cap = 4 * config.board.width * config.board.height + 10;
  let guard = 0;
  while (!isOver(state) && guard < cap) {
    guard++;
    const turn = currentTurn(state);
    const decision = selectMove(state, turn, turn === 'A' ? aLevel : bLevel, rng);
    if ('noMove' in decision) break;
    const res = applyShot(state, turn, decision.move);
    if ('rejected' in res) continue;
    state = res.state;
  }
  return getWinner(state);
}

interface PairResult {
  x: AiLevel;
  y: AiLevel;
  xWins: number;
  yWins: number;
  draws: number; // abgebrochene/unentschiedene Partien (sollte 0 sein)
  games: number;
}

function runPair(config: GameConfig, x: AiLevel, y: AiLevel, n: number): PairResult {
  let xWins = 0;
  let yWins = 0;
  let draws = 0;
  for (let g = 0; g < n; g++) {
    // Startspieler pro Partie wechseln, um den Erstzug-Vorteil auszugleichen.
    const xStarts = g % 2 === 0;
    const aLevel = xStarts ? x : y;
    const bLevel = xStarts ? y : x;
    const seed = (g + 1) * 7919 + LEVELS.indexOf(x) * 31 + LEVELS.indexOf(y);
    const winnerSide = playGame(config, aLevel, bLevel, seed);
    if (winnerSide === null) {
      draws++;
      continue;
    }
    const winnerLevel = winnerSide === 'A' ? aLevel : bLevel;
    if (winnerLevel === x) xWins++;
    else yWins++;
  }
  return { x, y, xWins, yWins, draws, games: n };
}

function pct(n: number, total: number): string {
  return total === 0 ? '—' : `${((100 * n) / total).toFixed(1)}%`;
}

function main(): void {
  const n = Number(process.argv[2] ?? '200');
  const touchingArg = (process.argv[3] ?? 'on').toLowerCase();
  const allowTouching = touchingArg !== 'off';
  const config = defineConfig({ allowTouching });

  if (!Number.isInteger(n) || n <= 0) {
    console.error(`Ungültiges N: ${process.argv[2]}`);
    process.exit(1);
  }

  console.log(`\n🎯  KI-Turnier  ·  ${n} Partien pro Paarung  ·  Board ${config.board.width}×${config.board.height}  ·  Berührung ${allowTouching ? 'erlaubt' : 'verboten'}\n`);

  const totalWins: Record<AiLevel, number> = { random: 0, 'hunt-target': 0, density: 0 };
  const totalGames: Record<AiLevel, number> = { random: 0, 'hunt-target': 0, density: 0 };

  console.log('Direkte Duelle');
  console.log('─'.repeat(64));
  for (let i = 0; i < LEVELS.length; i++) {
    for (let j = i + 1; j < LEVELS.length; j++) {
      const r = runPair(config, LEVELS[i]!, LEVELS[j]!, n);
      totalWins[r.x] += r.xWins;
      totalWins[r.y] += r.yWins;
      totalGames[r.x] += r.games;
      totalGames[r.y] += r.games;
      const drawNote = r.draws > 0 ? `  (⚠ ${r.draws} Abbrüche)` : '';
      console.log(
        `${LABEL[r.x].padEnd(22)} vs ${LABEL[r.y].padEnd(22)}  ` +
          `${pct(r.xWins, r.games).padStart(6)}  :  ${pct(r.yWins, r.games).padStart(6)}${drawNote}`,
      );
    }
  }

  console.log('\nGesamt-Siegquote (über alle Duelle)');
  console.log('─'.repeat(64));
  const ranking = [...LEVELS].sort((a, b) => totalWins[b] / totalGames[b] - totalWins[a] / totalGames[a]);
  ranking.forEach((level, idx) => {
    console.log(`${idx + 1}. ${LABEL[level].padEnd(22)}  ${pct(totalWins[level], totalGames[level]).padStart(6)}  (${totalWins[level]}/${totalGames[level]})`);
  });

  const expected: AiLevel[] = ['density', 'hunt-target', 'random'];
  const ok = ranking[0] === expected[0] && ranking[1] === expected[1] && ranking[2] === expected[2];
  console.log('\n' + '─'.repeat(64));
  if (ok) {
    console.log('✅  Erwartung erfüllt: Schwer > Mittel > Leicht.');
  } else {
    console.log('❌  Erwartung NICHT erfüllt (Schwer > Mittel > Leicht). KI-Logik prüfen!');
    process.exitCode = 1;
  }
  console.log('');
}

main();
