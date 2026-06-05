# @schiffe/web

Schlichtes Next.js/React-Frontend, um „Schiffe versenken" gegen die KI zu spielen. Die gesamte
**Spiellogik läuft clientseitig** aus `@schiffe/engine` (Single Source of Truth) — das Frontend
bildet keine Regeln nach und legt verdeckte Gegnerpositionen nie offen.

Ab Feature 003 (Identität & Persistenz) spricht das Frontend zusätzlich mit der API
(`@schiffe/server`): Registrierung/Login/Gast, Profil und das Melden beendeter KI-Ergebnisse für
die Statistik. Der **Netzwerkzugriff ist auf `src/api/` beschränkt** (durch einen Test erzwungen);
das Spiel selbst bleibt offline. Ohne laufenden Server kann weiterhin anonym gegen die KI gespielt
werden — nur Auth/Statistik stehen dann nicht zur Verfügung.

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
- `src/hooks/useGameSession.ts` — React-Hook: Zustand + zeitgesteuertes Abspielen der KI-Schüsse (Pacing); meldet das Ergebnis bei Spielende (FR-019/020).
- `src/api/client.ts` — einzige Netzwerk-Grenze: typisierter Fetch-Client (`credentials: 'include'`) gegen die `@schiffe/server`-API.
- `src/auth/useIdentity.ts` — React-Hook: Session-Restore (`GET /me`), Registrierung/Login/Gast/Logout.
- `src/components/` — dünne Präsentationskomponenten (Platzierung, Boards, Status, `AuthPanel`, `ProfilePanel`).
- `app/` — Next.js App Router; `next.config.mjs` proxyt im Dev `/api/*` → Server (Same-Origin-Cookies).
