# Quickstart: Minimal-Frontend (`packages/web`)

Bewusst schlichtes, vollständig clientseitiges Next.js-Frontend, das gegen die KI gespielt wird.
Alle Spielregeln stammen aus `@schiffe/engine` (Single Source of Truth).

## Voraussetzungen

- Node.js (LTS). Das Web-Paket bindet das Engine-Paket per npm-Workspace ein
  (`"@schiffe/engine": "*"`; npm löst es lokal auf — das `workspace:*`-Protokoll ist npm-fremd).

## Setup & Start

```bash
npm install                                      # installiert Web- + Engine-Deps (Workspace)

npm --workspace packages/web run dev             # Next.js Dev-Server (http://localhost:3000)
npm --workspace packages/web run build           # Produktionsbuild (clientseitig)
npm --workspace packages/web run test            # Vitest: Controller-Unit- + Komponententests
npm --workspace packages/web run lint            # ESLint
npm --workspace packages/web run typecheck       # tsc --noEmit (strict)
```

## Spielablauf (was die UI tut)

1. **Stufe wählen**: Leicht / Mittel / Schwer → mappt auf die Engine-KI-Stufen
   (`random` / `hunt-target` / `density`).
2. **Flotte platzieren**: Schiffe per Drag aufs 10×10-Raster ziehen, durch Antippen/Dreh-Button
   drehen. Ungültige Platzierungen (außerhalb/Überlappung) werden von der Engine abgelehnt.
   Alternativ „zufällig platzieren". „Spiel starten" wird erst bei vollständiger gültiger Flotte
   aktiv.
3. **Spielen**: Auf das Gegnerfeld klicken/tippen → Treffer/Fehlschuss/versenkt (Engine). Bei
   Treffer bleibt man am Zug (Extrazug); nach Fehlschuss zieht die KI (mit kurzer sichtbarer
   Verzögerung zwischen mehreren KI-Schüssen).
4. **Spielende**: „Gewonnen"/„Verloren" wird angezeigt, Eingabe gesperrt; „Neues Spiel" startet
   ohne Reload.

## Minimalbeispiel: Session-Controller (ohne React)

```ts
import { createSession, chooseDifficulty, autoPlace, startGame, playerShoot, aiStep, isAiTurn } from '@/session/controller';

let s = createSession(12345);
s = chooseDifficulty(s, 'schwer');
s = autoPlace(s);            // gültige Flotte via Engine generieren
s = startGame(s);            // phase = 'playing'

const shot = playerShoot(s, { x: 0, y: 0 });
s = shot.next;               // shot.accepted === true, falls gültiger Zug
while (isAiTurn(s)) s = aiStep(s);   // im UI mit Verzögerung; hier ohne
```

## Akzeptanz schnell prüfen

| Spec | Prüfung |
|------|---------|
| FR-001 (Engine = SSoT) | Controller-Tests: keine Regel-Logik außerhalb der Engine |
| FR-002 (Fog of War) | `opponentShots`/CellView enthalten nie verdeckte Gegnerschiffe |
| FR-006/008 (Platzierung) | ungültige Platzierung wird abgelehnt; „Start" erst bei gültiger Flotte |
| FR-011 (Extrazug) | `turn` bleibt nach Treffer beim Menschen, wechselt nach Fehlschuss |
| FR-015/017 (Ende/Neustart) | `outcome` korrekt; `restart` ohne Reload |
| FR-018 (offline) | keine Netzwerkanfragen während einer Partie |
| FR-020 (Pacing) | Hook-Test: Verzögerung zwischen aufeinanderfolgenden KI-Schüssen |
