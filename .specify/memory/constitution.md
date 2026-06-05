<!--
SYNC IMPACT REPORT
==================
Version change: (uninitialized template) → 1.0.0
Bump rationale: Initial ratification of the project constitution (first concrete
  definition of all principles and governance). Per semantic versioning, the first
  populated version is 1.0.0.

Modified principles:
  - [PRINCIPLE_1_NAME] → I. Server-autoritative Spiellogik (NON-NEGOTIABLE)
  - [PRINCIPLE_2_NAME] → II. Test-First / TDD für die Engine (NON-NEGOTIABLE)
  - [PRINCIPLE_3_NAME] → III. Geteilte, framework-unabhängige TypeScript-Engine (Single Source of Truth)
  - [PRINCIPLE_4_NAME] → IV. Hohe Codequalität
  - [PRINCIPLE_5_NAME] → (removed; project defined 4 principles, not 5)

Added sections:
  - Technologie- & Architektur-Constraints (replaces [SECTION_2_NAME])
  - Entwicklungs-Workflow & Quality Gates (replaces [SECTION_3_NAME])

Removed sections:
  - Fifth template principle slot (intentionally dropped — only 4 principles requested)

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — "Constitution Check" gate is generic
       ([Gates determined based on constitution file]); compatible, no edit needed.
  - ✅ .specify/templates/spec-template.md — mandatory sections compatible; no edit needed.
  - ⚠ .specify/templates/tasks-template.md — template marks tests as OPTIONAL by default.
       Per Principle II (TDD NON-NEGOTIABLE), test tasks for engine-layer work are
       MANDATORY and MUST precede implementation. Authors of tasks.md for any engine
       work must override the "tests OPTIONAL" default. No structural edit applied;
       enforced via the Constitution Check gate at plan time.

Follow-up TODOs: none. RATIFICATION_DATE set to first adoption date (2026-06-05).
-->

# Schiffe Constitution

## Core Principles

### I. Server-autoritative Spiellogik (NON-NEGOTIABLE)

Der Server ist die alleinige Autorität über den Spielzustand. Es gilt verbindlich:

- Clients senden ausschließlich **Intents/Aktionen** (z. B. „Schuss auf C4", „Schiff
  platzieren"), niemals autoritativen Zustand. Der Server validiert jede Aktion gegen die
  Spielregeln und berechnet den resultierenden Zustand selbst.
- Sämtliche regelrelevanten Entscheidungen — Trefferauswertung, Gültigkeit von
  Platzierungen, Zugreihenfolge, Sieg-/Niederlagebedingungen, Sichtbarkeit gegnerischer
  Informationen — MÜSSEN serverseitig erfolgen.
- Der Client erhält nur die Information, die er sehen darf; verdeckte Zustände (z. B.
  gegnerische Schiffspositionen) verlassen den Server niemals vorzeitig.
- Clientseitige Vorhersage/Optimistic-UI ist erlaubt, ist aber nie autoritativ und wird bei
  Abweichung durch den Serverzustand überschrieben.

**Rationale**: Verhindert Cheating und Zustands-Divergenz und macht das Spiel in einer
nicht vertrauenswürdigen Client-Umgebung (Browser) korrekt und fair.

### II. Test-First / TDD für die Engine (NON-NEGOTIABLE)

Engine-Logik wird testgetrieben entwickelt. Der Red-Green-Refactor-Zyklus ist verbindlich:

- Für jede Engine-Funktionalität werden **zuerst** Tests geschrieben, die das gewünschte
  Verhalten beschreiben. Diese Tests MÜSSEN zunächst fehlschlagen (Red), bevor
  Implementierung beginnt.
- Erst danach folgt die minimale Implementierung bis zum grünen Test (Green), anschließend
  Refactoring unter weiterhin grünen Tests (Refactor).
- Engine-Code OHNE vorausgehende fehlschlagende Tests wird nicht akzeptiert.
- Regeln, Edge Cases und Determinismus (gleiche Eingabe → gleiche Ausgabe) werden durch
  Tests abgesichert. Bugfixes beginnen mit einem reproduzierenden, fehlschlagenden Test.

**Rationale**: Die Engine ist die Single Source of Truth (Prinzip III). Ihre Korrektheit ist
sicherheits- und fairnesskritisch und muss durch Tests beweisbar sein, nicht durch Inspektion.

### III. Geteilte, framework-unabhängige TypeScript-Engine (Single Source of Truth)

Die Spielregeln existieren genau einmal — in einer reinen TypeScript-Engine:

- Die Engine ist ein eigenständiges Modul/Package OHNE Abhängigkeit zu UI- oder
  Laufzeit-Frameworks (kein React/Vue/DOM, keine Node-spezifischen APIs, kein Netzwerk-,
  Datei- oder Datenbankzugriff).
- Sie besteht aus deterministischen, möglichst reinen Funktionen über explizitem Zustand;
  Zufall (z. B. Startspieler) wird über injizierbare Seeds/Generatoren übergeben, nicht intern
  erzeugt.
- **Dieselbe** Engine läuft auf Server (autoritativ, Prinzip I) und Client (Vorhersage,
  Validierung, UI). Es gibt keine zweite, abweichende Regel-Implementierung.
- Server und Client hängen von der Engine ab; die Engine hängt von keinem von beiden ab.
  Abhängigkeiten zeigen ausschließlich zur Engine hin.

**Rationale**: Eine einzige, framework-freie Regelquelle eliminiert Regel-Drift zwischen
Client und Server, ist isoliert testbar (Prinzip II) und über Plattformen hinweg portabel.

### IV. Hohe Codequalität

Code wird auf einem Qualitätsniveau gehalten, das Korrektheit und Wartbarkeit sichert:

- TypeScript im **strict**-Modus; `any` ist unzulässig (Ausnahmen explizit begründet).
  Öffentliche Engine-APIs sind vollständig typisiert.
- Linting und Formatierung sind automatisiert und MÜSSEN vor dem Merge fehlerfrei sein
  (CI-Gate). Warnungen werden behandelt, nicht ignoriert.
- Jede Änderung durchläuft Review; Reviews prüfen Einhaltung dieser Verfassung.
- Funktionen/Module bleiben klein und nach Zweck benannt (YAGNI, keine spekulative
  Komplexität). Zusätzliche Komplexität MUSS begründet werden.

**Rationale**: Strikte Typisierung und automatisierte Gates fangen Fehlerklassen früh ab und
halten die langlebige Single-Source-of-Truth-Engine änderbar.

## Technologie- & Architektur-Constraints

- **Sprache**: TypeScript über den gesamten Stack (Engine, Server, Client).
- **Schichtung**: `engine` (framework-frei) ← `server` (autoritative Laufzeit, Transport)
  und `client` (UI/Rendering/Input). Abhängigkeitsrichtung ausschließlich zur Engine.
- **Transport**: Client↔Server kommunizieren über ein versioniertes, typisiertes
  Nachrichten-/Contract-Format (Intents hinein, autoritative State-Updates/Events heraus).
- **Determinismus**: Engine-Ergebnisse dürfen nicht von Wall-Clock-Zeit, globalem Zufall
  oder Umgebung abhängen; solche Eingaben werden injiziert.
- Verstöße gegen diese Constraints sind in der „Complexity Tracking"-Sektion des Plans zu
  begründen oder zu beseitigen.

## Entwicklungs-Workflow & Quality Gates

- **TDD-Gate**: Engine-Arbeit beginnt mit fehlschlagenden Tests (Prinzip II). Diese
  Verfassung übersteuert die Default-Einstellung des tasks-Templates, das Tests als optional
  kennzeichnet — für Engine-Aufgaben sind Tests verpflichtend und stehen vor der
  Implementierung.
- **Constitution Check**: Jeder Plan (`plan.md`) MUSS den Constitution-Check vor Phase 0
  bestehen und nach dem Design erneut. Verstöße ohne Rechtfertigung blockieren den Fortschritt.
- **CI-Gate**: Build, Lint, Format-Check und die gesamte Testsuite MÜSSEN grün sein, bevor
  gemergt wird.
- **Review-Gate**: Mindestens ein Review pro Änderung; der Reviewer bestätigt explizit die
  Verfassungskonformität (insb. Autorität, TDD, Single Source of Truth).

## Governance

- Diese Verfassung hat Vorrang vor allen anderen Praktiken und Konventionen des Projekts.
- **Änderungen** an der Verfassung erfordern: dokumentierten Vorschlag, Begründung,
  Versions-Bump nach untenstehender Regel sowie Abgleich abhängiger Templates und Dokumente.
- **Versionierung** (Semantic Versioning der Verfassung):
  - MAJOR: rückwärtsinkompatible Entfernung/Neudefinition von Prinzipien oder Governance.
  - MINOR: neues Prinzip/Abschnitt oder materiell erweiterte Vorgaben.
  - PATCH: Klarstellungen, Formulierungen, nicht-semantische Korrekturen.
- **Compliance-Review**: Alle PRs/Reviews verifizieren die Einhaltung; ungerechtfertigte
  Komplexität wird abgelehnt. Bei Konflikt zwischen Dokument und Praxis gilt die Verfassung,
  bis sie förmlich geändert wird.

**Version**: 1.0.0 | **Ratified**: 2026-06-05 | **Last Amended**: 2026-06-05
