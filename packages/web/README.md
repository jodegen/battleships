# @schiffe/web

Bewusst schlichtes, vollständig clientseitiges Next.js/React-Frontend, um „Schiffe versenken"
gegen die KI zu spielen (Meilenstein 2). Die gesamte Spiellogik stammt aus `@schiffe/engine`
(Single Source of Truth) — das Frontend bildet keine Regeln nach und legt verdeckte
Gegnerpositionen nie offen.

## Befehle

```bash
npm install                                  # Web- + Engine-Deps (npm-Workspace)
npm --workspace packages/web run dev         # Dev-Server (http://localhost:3000)
npm --workspace packages/web run build       # Produktionsbuild (statisch/clientseitig)
npm --workspace packages/web run test        # Vitest: Controller-Unit- + Komponententests
npm --workspace packages/web run typecheck   # tsc --noEmit (strict)
npm --workspace packages/web run lint        # ESLint
```

Die Engine wird über `transpilePackages` direkt aus dem TS-Quellcode konsumiert (kein
Engine-Vorbau nötig). Siehe `specs/002-minimal-frontend-ai/quickstart.md` für den Spielablauf
und `contracts/session-controller.md` für die UI↔Engine-Naht.

## Aufbau

- `src/session/` — framework-unabhängiger Session-Controller (reine Funktionen, nur Engine-Aufrufe), mit Vitest getestet.
- `src/hooks/useGameSession.ts` — React-Hook: Zustand + zeitgesteuertes Abspielen der KI-Schüsse (Pacing).
- `src/components/` — dünne Präsentationskomponenten (Platzierung, Boards, Status).
- `app/` — Next.js App Router (rein clientseitig).
