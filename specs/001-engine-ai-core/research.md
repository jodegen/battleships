# Phase 0 Research: Spiel-Engine & KI (Meilenstein 1)

Alle Technical-Context-Punkte sind durch die User-Vorgaben und die Spec festgelegt; es
verbleiben keine offenen `NEEDS CLARIFICATION`. Dieses Dokument hält die getroffenen
Entscheidungen, ihre Begründung und verworfene Alternativen fest.

## 1. Sprache & Build

- **Decision**: TypeScript 5.x, `strict: true`, Ziel ES2022, Auslieferung als ESM mit
  `.d.ts`-Typdeklarationen; Build über `tsc` (optional zusätzlicher CJS-Output).
- **Rationale**: Verfassung verlangt eine framework-unabhängige TS-Engine mit hoher
  Codequalität; `strict` + kein `any` erfüllt Prinzip IV. ESM ist sowohl in Node (Server) als
  auch im Browser (Client) konsumierbar (Prinzip III).
- **Alternatives considered**: Bundler (tsup/esbuild) — für ein dep-freies Paket nicht
  erforderlich, `tsc` genügt und hält die Toolchain minimal. JavaScript ohne Typen — verstößt
  gegen Prinzip IV.

## 2. Testframework

- **Decision**: Vitest; Tests in `tests/{unit,integration,contract}`, TDD (Red-Green-Refactor).
- **Rationale**: Vom Nutzer vorgegeben; schnelle ESM-/TS-native Ausführung, gute Watch- und
  Coverage-Unterstützung. Erfüllt Prinzip II.
- **Alternatives considered**: Jest — schwergewichtiger bei ESM/TS-Setup; node:test — weniger
  Komfort. Beide ohne Mehrwert gegenüber Vitest hier.

## 3. Determinismus & Zufall

- **Decision**: Eine injizierbare RNG-Abstraktion `Rng` (z. B. `() => number` in `[0,1)` oder
  ein kleines Interface mit `nextInt(maxExclusive)`/`pick(array)`). Mitgeliefert wird eine
  seed-basierte, reine PRNG-Implementierung (z. B. mulberry32/xorshift). Engine-Funktionen
  erhalten die RNG als Parameter; nirgends `Math.random`/`Date.now`.
- **Rationale**: FR-028 verlangt Determinismus und Injektion; Prinzip I/III verlangen, dass
  Server und Client identische Ergebnisse reproduzieren können (autoritative Validierung).
  Reproduzierbare KI-Züge (SC-007) und Aufstellungen (SC-008) werden so testbar.
- **Alternatives considered**: Globaler Seed/Singleton — bricht Reinheit und Paralleltests.
  `crypto.getRandomValues` — nicht deterministisch, plattformabhängig.

## 4. Zustandsmodell: Immutabilität

- **Decision**: Spielzustand als explizites, unveränderliches Datenobjekt; Operationen
  (`applyShot`, Zugwechsel) geben einen **neuen** Zustand zurück (keine In-Place-Mutation der
  Eingabe). Reine Funktionen `(state, input, rng?) => result`.
- **Rationale**: Reine Funktionen (Nutzervorgabe) erleichtern autoritative Re-Validierung,
  Snapshotting für spätere Replays/Reconnect (außerhalb dieses Scopes, aber nicht verbaut) und
  deterministische Tests. Erfüllt Prinzip I/III.
- **Alternatives considered**: Mutierende Klassen-Engine — schlechter testbar, Gefahr
  versteckter Seiteneffekte; widerspricht „reine Funktionen".

## 5. Board-Repräsentation

- **Decision**: Board als kompakte Struktur — Schiffe als Liste (Position, Orientierung, Länge,
  getroffene Zellen) plus ein Set/Index beschossener Koordinaten. Koordinaten 0-basiert
  `{x, y}`. Abgeleitete Sichten (Trefferkarte) werden bei Bedarf berechnet.
- **Rationale**: Klein, deterministisch serialisierbar, einfache Überlappungs-/Nachbarschafts-
  prüfung. Trennung „eigene Schiffe" vs. „Beschuss" stützt die Fog-of-War-Sicht (FR-021).
- **Alternatives considered**: Dichtes 2D-Array von Zellen-Enums — bequem, aber redundant für
  Schiffsidentität (für „versenkt"/Länge, FR-018/FR-031) und schwerer rein zu halten. Wird
  intern ggf. als abgeleitete Sicht erzeugt, ist aber nicht der kanonische Zustand.

## 6. Berührungs-/Abstandsregel

- **Decision**: Zentrale Nachbarschaftsfunktion. „Berührung erlaubt": nur Überlappung verboten.
  „Berührung verboten": jedes Schiff benötigt ringsum (orthogonal **und** diagonal, 8er-
  Nachbarschaft) mindestens ein freies Feld Abstand (FR-009/FR-010). Randfelder reduzieren die
  geprüfte Nachbarschaft.
- **Rationale**: Spec-Annahme „mindestens ein Feld Abstand"; eine gemeinsame Funktion wird von
  Platzierungsvalidierung, Generator und der schweren KI (FR-033) wiederverwendet.
- **Alternatives considered**: Nur orthogonale Sperre — entspricht nicht der klassischen „kein
  Anstoßen"-Regel und der Spec-Klärung.

## 7. KI-Strategien

- **Decision**:
  - **Zufall** (FR-024): gleichverteilte Auswahl unter unbeschossenen In-Bounds-Feldern via
    injizierter RNG; kein Nachsetzen.
  - **Hunt & Target** (FR-025): Zustand aus offenen (nicht versenkten) Treffern ableiten;
    Target-Modus auf orthogonale Nachbarn, Achsen-Verfolgung bei ≥2 Treffern in Linie; ohne
    offene Treffer Hunt-Modus (Zufall). Berührungsregel-agnostisch.
  - **Wahrscheinlichkeitsdichte** (FR-026/032/033): Für jedes lebende Schiff alle gültigen
    Platzierungen enumerieren, die zu den bekannten Beobachtungen (Treffer/Fehlschläge/
    versenkte Schiffe) konsistent sind; je überdeckendem Feld einen Zähler erhöhen; Feld mit
    höchster Dichte wählen. Versenkte Schiffe (Länge aus FR-031) aus der lebenden Flotte
    entfernen (FR-032). Bei „Berührung verboten" Platzierungen verwerfen, die an bekannte/
    versenkte Schiffe angrenzen (FR-033). Im Suchmodus Parität (Schachbrett) gewichten.
    **Reine Dichte** — kein separater Target-Modus; die Konsistenz mit offenen Treffern
    konzentriert die Dichte automatisch (Klärung 2026-06-05).
- **Rationale**: Entspricht der Spec-Tabelle (Abschnitt 2.1) und den Klärungen; liefert die in
  SC-006 geforderte, messbar unterscheidbare Spielstärke.
- **Alternatives considered**: Monte-Carlo-Sampling statt vollständiger Enumeration — auf 10×10
  unnötig (vollständige Enumeration ist schnell genug, < 20 ms) und weniger deterministisch
  nachvollziehbar. Hybrid Dichte+Target — durch Klärung verworfen.

## 8. Öffentliche API-Form

- **Decision**: Schmale, funktionale öffentliche API (Barrel `index.ts`): Typen + reine
  Funktionen (`createGame`, `validatePlacement`, `placeFleet`/`generateFleet`, `applyShot`,
  `getWinner`/`isOver`, `viewFor`, `selectMove`). Details siehe `contracts/public-api.md`.
- **Rationale**: Funktional + deterministisch erfüllt Nutzervorgabe und Prinzip III; klein
  gehaltene Oberfläche reduziert Kopplung und erleichtert spätere Server-Integration.
- **Alternatives considered**: Eine große `Game`-Klasse mit Methoden — verträgt sich schlechter
  mit Reinheit/Tree-Shaking; verworfen.

## 9. Monorepo-Layout

- **Decision**: Workspace-Root mit `packages/engine`; spätere `server`/`client` als
  Geschwisterpakete. Meilenstein 1 erstellt nur `engine`.
- **Rationale**: Verfassungs-Schichtung (`engine` ← `server`/`client`), Abhängigkeit nur zur
  Engine. Vorbereitung ohne Mehraufwand für Meilenstein 1.
- **Alternatives considered**: Flaches Single-Package-Repo — müsste später umstrukturiert
  werden; Monorepo jetzt aufzusetzen ist günstiger.
