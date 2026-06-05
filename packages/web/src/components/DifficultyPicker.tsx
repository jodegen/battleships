import { DIFFICULTIES, type Difficulty } from '@/session/types';

const LABELS: Record<Difficulty, string> = {
  leicht: 'Leicht (Zufall)',
  mittel: 'Mittel (Hunt & Target)',
  schwer: 'Schwer (Dichte)',
};

export function DifficultyPicker({ onChoose }: { onChoose: (d: Difficulty) => void }): JSX.Element {
  return (
    <section>
      <h2>Schwierigkeit wählen</h2>
      <div className="row">
        {DIFFICULTIES.map((d) => (
          <button key={d} type="button" onClick={() => onChoose(d)}>
            {LABELS[d]}
          </button>
        ))}
      </div>
    </section>
  );
}
