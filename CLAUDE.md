<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/002-minimal-frontend-ai/plan.md`

Active feature: **Minimal spielbares Frontend gegen die KI (002)** — Next.js + React + TS
Workspace-Paket (`packages/web`), rein clientseitig/offline, konsumiert die bestehende
`@schiffe/engine` als Single Source of Truth (keine Regel-Logik im Frontend, FR-001) und
legt verdeckte Gegnerpositionen nie offen (FR-002, via `viewFor`). Nicht-triviale Logik im
framework-unabhängigen Session-Controller (`src/session/`), mit Vitest getestet.

Vorheriges Feature: **Spiel-Engine & KI (Meilenstein 1)** — `packages/engine`, fertig.
<!-- SPECKIT END -->
