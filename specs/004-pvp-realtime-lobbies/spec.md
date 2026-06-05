# Feature Specification: PvP-Lobbys & Echtzeit-Online-Partie

**Feature Branch**: `004-pvp-realtime-lobbies`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "PvP-Lobbys und eine spielbare Echtzeit-Online-Partie zwischen zwei Menschen. Eingeloggte Spieler erstellen Lobbys (gut lesbarer Code); eingeloggte Spieler oder Gäste treten per Code bei. Lebenszyklus waiting → placing → in_progress → finished mit wählbaren Einstellungen (Berührung, Zug-Timer, Treffer=Extrazug). Server-autoritativ mit bestehender Engine als Single Source of Truth; Fog of War serverseitig erzwungen. Reconnect und Quick-Play ausdrücklich nicht Teil dieses Features."

## Clarifications

### Session 2026-06-05

- Q: Verhalten bei Verbindungsverlust/Verlassen während `in_progress`? → A: Sofort Sieg-durch-Aufgabe für den verbleibenden Spieler, regulär gewertet (FR-010a).
- Q: Welcher Umfang an Rate-Limiting / Anti-Abuse gehört in dieses Feature? → A: Minimal — Beitritts-Versuche drosseln (Schutz gegen Code-Erraten) + Obergrenze offener Lobbys pro Nutzer; breiteres Anti-Abuse (Event-Throttling, Schimpfwortfilter) ist Folge-Feature.
- Q: Welche gleichzeitige Last muss dieses Feature unterstützen? → A: MVP-Größenordnung — Dutzende gleichzeitiger Partien auf einer einzelnen Server-Instanz; keine horizontale Skalierung in diesem Feature.
- Q: Verlassen/Verbindungsverlust vor Spielstart (`waiting`/`placing`)? → A: Verlässt der Host, wird die Lobby geschlossen; verlässt der beigetretene zweite Spieler, wird sein Sitz frei und die Lobby kehrt zu `waiting` zurück.
- Q: Wählbare Zug-Timer-Stufen und Standard? → A: 15 / 30 / 60 s und „aus"; Standard 30 s (gemäß Projektspezifikation Abschnitt 6.3).
- Q: Inaktivitäts-Timeout einer Lobby ohne zweiten Beitritt? → A: 10 Minuten.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lobby erstellen und per Code beitreten (Priority: P1)

Ein eingeloggter Spieler erstellt eine private Lobby und wählt dabei die Spielregeln (Berührung erlaubt/verboten, Zug-Timer-Dauer, Treffer=Extrazug an/aus). Das System vergibt einen gut lesbaren Lobby-Code. Ein zweiter Mensch – eingeloggt oder als Gast mit temporärem Anzeigenamen – tritt mit diesem Code bei. Sobald zwei Spieler anwesend sind, wechselt die Lobby aus dem Wartezustand in die Platzierungsphase.

**Why this priority**: Ohne eine Lobby mit zwei verbundenen Spielern kann keine PvP-Partie stattfinden. Dies ist die Eintrittstür für das gesamte Feature und für sich genommen demonstrierbar.

**Independent Test**: Ein eingeloggter Spieler erstellt eine Lobby und erhält einen Code; ein zweiter Client tritt per Code bei (einmal als eingeloggter Nutzer, einmal als Gast). Verifizierbar daran, dass beide Spieler in derselben Lobby gelistet sind und der Status auf „placing" wechselt.

**Acceptance Scenarios**:

1. **Given** ein eingeloggter Spieler, **When** er eine Lobby mit gewählten Einstellungen erstellt, **Then** erhält er einen gut lesbaren Lobby-Code, und die Lobby steht im Status `waiting` mit ihm als einzigem Spieler.
2. **Given** eine wartende Lobby mit gültigem Code, **When** ein zweiter eingeloggter Spieler den Code eingibt, **Then** tritt er der Lobby als zweiter Spieler bei und beide sehen den Statuswechsel zu `placing`.
3. **Given** eine wartende Lobby mit gültigem Code, **When** ein Gast einen temporären Anzeigenamen wählt und den Code eingibt, **Then** tritt er der Lobby bei, ohne sich zu registrieren.
4. **Given** ein nicht eingeloggter Besucher (kein Gast-Beitritt zu bestehendem Code), **When** er versucht, eine Lobby zu erstellen, **Then** wird dies abgelehnt (nur eingeloggte Spieler dürfen erstellen).
5. **Given** ein ungültiger oder bereits voller/abgelaufener Code, **When** ein Spieler beizutreten versucht, **Then** wird der Beitritt mit einer verständlichen Meldung abgelehnt.

---

### User Story 2 - Schiffe platzieren (server-validiert) (Priority: P1)

Beide Spieler platzieren ihre Flotte auf dem 10×10-Feld. Der Server validiert jede Platzierung autoritativ gegen die Lobby-Einstellungen (Flottenzusammensetzung, keine Überlappung, Grenzen des Felds, Berührungsregel der Lobby). Wenn beide Spieler ihre Platzierung bestätigt haben, startet die Partie (`in_progress`).

**Why this priority**: Eine gültige, server-geprüfte Aufstellung beider Flotten ist Voraussetzung dafür, dass überhaupt geschossen werden kann. Gehört zum spielbaren Kern.

**Independent Test**: In einer Lobby im Status `placing` reichen beide Spieler je eine Platzierung ein; eine ungültige Platzierung wird abgelehnt, zwei gültige Platzierungen führen zum Status `in_progress`.

**Acceptance Scenarios**:

1. **Given** eine Lobby im Status `placing`, **When** ein Spieler eine regelkonforme Flotte einreicht, **Then** wird sie akzeptiert und sein Status auf „Schiffe platziert" gesetzt.
2. **Given** ein Spieler reicht eine ungültige Platzierung ein (falsche Schiffsanzahl/-größe, Überlappung, außerhalb des Felds, oder Berührung obwohl in der Lobby verboten), **When** der Server validiert, **Then** wird die Platzierung abgelehnt und der Spieler bleibt im Status „nicht platziert".
3. **Given** beide Spieler haben gültig platziert, **When** die zweite Bestätigung eingeht, **Then** wechselt die Lobby zu `in_progress` und es wird ein Startspieler bestimmt.
4. **Given** eine Lobby im Status `placing`, **When** ein Spieler die ungetroffene Flotte des Gegners abzurufen versucht, **Then** liefert der Server diese Information niemals aus.

---

### User Story 3 - Abwechselnde Echtzeit-Züge bis zum Sieg (Priority: P1)

Die beiden Spieler schießen abwechselnd in Echtzeit. Der Server wertet jeden Schuss autoritativ aus (Wasser/Treffer/versenkt), erzwingt die Zugreihenfolge und die Extrazug-Regel (falls aktiviert: nach Treffer bleibt derselbe Spieler am Zug), erkennt das Spielende und verkündet den Sieger. Jeder Spieler erhält ausschließlich seine eigene Flotte und seine bisherigen Schüsse; die ungetroffenen Schiffe des Gegners werden niemals an den Client gesendet (Fog of War).

**Why this priority**: Dies ist das Herzstück – die eigentliche spielbare Partie. Löst zugleich die in Meilenstein 2 dokumentierte Abweichung von Prinzip I auf, indem die gesamte Spiellogik server-autoritativ wird.

**Independent Test**: In einer laufenden Partie sendet der Spieler am Zug einen Schuss; das Ergebnis (Wasser/Treffer/versenkt) wird an beide Spieler verteilt, die Zughoheit wechselt regelkonform, und nach Versenken aller gegnerischen Schiffe wird ein Sieger gemeldet. Eine Inspektion der an den nicht-schießenden Spieler gesendeten Daten enthält keine ungetroffenen gegnerischen Schiffspositionen.

**Acceptance Scenarios**:

1. **Given** eine laufende Partie, **When** der Spieler am Zug ein noch nicht beschossenes Feld wählt, **Then** wertet der Server aus und verteilt das Ergebnis (Wasser/Treffer/versenkt) als Live-Update an beide Spieler.
2. **Given** ein Spieler ist nicht am Zug, **When** er einen Schuss sendet, **Then** lehnt der Server den Schuss ab und der Spielzustand bleibt unverändert.
3. **Given** Treffer=Extrazug ist aktiviert, **When** ein Schuss ein gegnerisches Feld trifft, **Then** bleibt derselbe Spieler am Zug; bei Wasser (miss) wechselt der Zug zum Gegner.
4. **Given** Treffer=Extrazug ist deaktiviert, **When** ein Schuss trifft, **Then** wechselt der Zug dennoch zum Gegner.
5. **Given** ein Feld wurde bereits beschossen, **When** derselbe Spieler erneut darauf schießt, **Then** lehnt der Server den Schuss ab (kein doppeltes Zählen, idempotent).
6. **Given** der letzte verbliebene Schiffsteil des Gegners wird getroffen, **When** der Server auswertet, **Then** wechselt die Lobby zu `finished` und der Schütze wird als Sieger gemeldet.
7. **Given** eine laufende Partie, **When** ein Client den vollständigen Zustand anfragt, **Then** enthält die Antwort nur die eigene Flotte plus eigene Schüsse und – vom Gegner – nur getroffene/versenkte Felder, niemals ungetroffene gegnerische Schiffe.

---

### User Story 4 - Server-sichtbarer Zug-Timer (Priority: P2)

Während `in_progress` läuft pro Zug ein serverseitig gemessenes Zeitlimit (Lobby-Einstellung). Beide Spieler sehen einen Countdown. Läuft die Zeit ab, verfällt der Zug (kein automatischer Schuss) und der Gegner ist an der Reihe. Bei einem Treffer (mit aktivierter Extrazug-Regel) startet der Timer für den nächsten Schuss neu.

**Why this priority**: Verhindert, dass eine Partie durch Inaktivität blockiert; verpflichtendes Element gemäß Projektspezifikation. Setzt aber auf dem spielbaren Kern (P1) auf.

**Independent Test**: In einer laufenden Partie wird der Timer ohne Aktion ablaufen gelassen; verifizierbar daran, dass der Zug ohne Schuss an den Gegner übergeht. Nach einem Treffer wird der sichtbare Countdown neu gestartet.

**Acceptance Scenarios**:

1. **Given** eine laufende Partie mit aktiviertem Timer, **When** ein Zug beginnt, **Then** zeigen beide Clients einen Countdown, dessen verbleibende Zeit der Server bestimmt.
2. **Given** der Spieler am Zug handelt nicht, **When** der Timer abläuft, **Then** verfällt der Zug ohne Schuss und der Gegner wird am Zug, beide werden live informiert.
3. **Given** Treffer=Extrazug aktiv und ein Treffer erfolgt, **When** der Spieler am Zug bleibt, **Then** startet der Timer für den nächsten Schuss neu.
4. **Given** eine Lobby wurde mit Timer „aus" erstellt, **When** eine Partie läuft, **Then** gibt es kein Zeitlimit und kein Zug verfällt automatisch.

---

### User Story 5 - Live-Statusanzeige für beide Spieler (Priority: P2)

Beide Spieler sehen in Echtzeit den eigenen und den gegnerischen Status: verbunden, Schiffe platziert, wer am Zug ist. Jeder Schuss und sein Ergebnis sowie das Spielende mit Sieger werden als Live-Update verteilt.

**Why this priority**: Macht die Echtzeit-Erfahrung verständlich und transparent. Wertvoll, aber das Spiel ist auch ohne reiche Statusanzeige im Kern (P1) spielbar.

**Independent Test**: Bei jedem relevanten Ereignis (Beitritt, Platzierung bestätigt, Zugwechsel, Schussergebnis, Spielende) erhalten beide verbundenen Clients eine entsprechende Live-Aktualisierung.

**Acceptance Scenarios**:

1. **Given** zwei Spieler in einer Lobby, **When** einer beitritt oder seine Platzierung bestätigt, **Then** wird der aktualisierte Status („verbunden" / „Schiffe platziert") an beide verteilt.
2. **Given** eine laufende Partie, **When** der Zug wechselt, **Then** sehen beide Spieler korrekt, wer aktuell am Zug ist.
3. **Given** eine laufende Partie, **When** ein Schuss ausgewertet wird, **Then** erhalten beide Spieler das Ergebnis als Live-Update.

---

### User Story 6 - Statistik-Update bei eingeloggten Spielern (Priority: P3)

Wenn eine PvP-Partie regulär endet (alle Schiffe eines Spielers versenkt), wird das Ergebnis in die Statistik jedes beteiligten eingeloggten Spielers geschrieben – auch wenn der Gegner ein Gast war. Für Gäste wird keine Statistik geführt.

**Why this priority**: Erhöht den langfristigen Wert für registrierte Nutzer, ist aber nicht nötig, um eine Partie spielbar zu machen. Baut auf dem bestehenden Statistik-/Persistenz-Mechanismus aus Meilenstein 2 auf.

**Independent Test**: Eine Partie wird bis zum Sieg gespielt; danach ist die Statistik des eingeloggten Siegers/Verlierers entsprechend aktualisiert, während ein beteiligter Gast keinen Statistikeintrag erhält.

**Acceptance Scenarios**:

1. **Given** eine beendete Partie zwischen zwei eingeloggten Spielern, **When** das Ergebnis feststeht, **Then** werden Sieg bzw. Niederlage in beide Spielerstatistiken geschrieben (genau einmal).
2. **Given** eine beendete Partie eingeloggter Spieler vs. Gast, **When** das Ergebnis feststeht, **Then** wird nur die Statistik des eingeloggten Spielers aktualisiert; der Gast erhält keinen Eintrag.
3. **Given** dasselbe Partieergebnis wird (z. B. durch Wiederholung/Lag) mehrfach gemeldet, **When** die Statistik geschrieben wird, **Then** zählt das Ergebnis genau einmal (idempotent).
4. **Given** eine laufende Partie, **When** ein Spieler die Verbindung verliert oder die Lobby verlässt, **Then** endet die Partie als Sieg-durch-Aufgabe für den verbleibenden Spieler und wird wie ein reguläres Ergebnis gewertet.

---

### Edge Cases

- **Verbindungsabbruch während der Partie**: Reconnect-Handling ist ausdrücklich nicht Teil dieses Features. Verliert ein Spieler während `in_progress` die Verbindung oder verlässt er die Lobby, endet die Partie sofort als Sieg-durch-Aufgabe für den verbleibenden Spieler; das Ergebnis wird regulär gewertet (Status → `finished`, Statistik-Eintrag für beteiligte eingeloggte Spieler).
- **Wiederholt ablaufender Timer**: Wenn beide Spieler nacheinander den Timer verfallen lassen, läuft die Partie regulär weiter (kein Schuss, Zugwechsel); es gibt keine automatische Aufgabe nach N Timeouts in diesem Feature.
- **Doppelt gesendeter Zug** (Lag/Re-Send): Wird über eine Zug-/Move-Identität idempotent behandelt und zählt nur einmal.
- **Beitritt zu voller Lobby / drittem Spieler**: Ein dritter Beitrittsversuch wird abgelehnt – eine Lobby fasst genau zwei Spieler.
- **Inaktive/leere Lobby**: Eine Lobby, der innerhalb von 10 Minuten kein zweiter Spieler beitritt, wird automatisch geschlossen.
- **Spieler-am-Zug verlässt**: siehe Verbindungsabbruch oben.
- **Verlassen vor Spielstart** (`waiting`/`placing`): Host-Austritt schließt die Lobby; Austritt des zweiten Spielers gibt den Sitz frei und setzt die Lobby auf `waiting` zurück (FR-011a).
- **Schuss vor Spielstart / nach Spielende**: Schüsse, die nicht im Status `in_progress` eingehen, werden abgelehnt.
- **Gast-Anzeigename**: leere, zu lange oder offensichtlich ungültige Namen werden abgelehnt (Längen-/Formatprüfung); ein inhaltlicher Schimpfwortfilter ist nicht Teil dieses Features.

## Requirements *(mandatory)*

### Functional Requirements

**Lobby-Erstellung & Beitritt**

- **FR-001**: Nur eingeloggte Spieler MÜSSEN Lobbys erstellen können; nicht authentifizierte Besucher dürfen keine Lobby erstellen.
- **FR-002**: Beim Erstellen MUSS das System einen für Menschen gut lesbaren, ausreichend zufälligen Lobby-Code erzeugen, der die Lobby eindeutig identifiziert.
- **FR-003**: Sowohl eingeloggte Spieler als auch Gäste MÜSSEN einer Lobby über den Code beitreten können; Gäste geben dazu einen temporären Anzeigenamen an, ohne sich zu registrieren.
- **FR-004**: Das System MUSS den Beitritt ablehnen, wenn der Code ungültig, die Lobby bereits voll (zwei Spieler) oder geschlossen/abgelaufen ist; eine Lobby fasst genau zwei Spieler.
- **FR-005**: Beim Erstellen MUSS der Ersteller folgende Einstellungen wählen können: Berührung von Schiffen erlaubt/verboten, Zug-Timer-Dauer (15 / 30 / 60 s oder „aus"; Standard 30 s), Treffer=Extrazug an/aus. Diese Einstellungen MÜSSEN Teil des Lobby-/Partiezustands sein und serverseitig erzwungen werden.
- **FR-006**: Das System MUSS Gast-Anzeigenamen auf Länge/Format prüfen und ungültige Namen ablehnen. (Ein inhaltlicher Schimpfwortfilter ist nicht Teil dieses Features.)
- **FR-006a**: Das System MUSS Beitritts-Versuche pro Verbindung/Code drosseln, um das Erraten von Lobby-Codes zu erschweren.
- **FR-006b**: Das System MUSS die Anzahl gleichzeitig offener (nicht beendeter) Lobbys pro eingeloggtem Spieler begrenzen. Weitergehendes Anti-Abuse (Zug-/Event-Throttling, inhaltliche Namensfilter) ist NICHT Teil dieses Features.

**Lebenszyklus**

- **FR-007**: Das System MUSS den Lobby-Lebenszyklus `waiting` → `placing` → `in_progress` → `finished` abbilden und Statusübergänge serverseitig steuern.
- **FR-008**: Der Übergang `waiting` → `placing` MUSS erfolgen, sobald zwei Spieler in der Lobby anwesend sind.
- **FR-009**: Der Übergang `placing` → `in_progress` MUSS erfolgen, sobald beide Spieler eine gültige Flotte bestätigt haben; dabei MUSS ein Startspieler bestimmt werden.
- **FR-010**: Der Übergang `in_progress` → `finished` MUSS erfolgen, sobald alle Schiffe eines Spielers versenkt sind; der Sieger MUSS festgestellt und gemeldet werden.
- **FR-010a**: Verliert ein Spieler während `in_progress` die Verbindung oder verlässt er die Lobby, MUSS die Partie sofort als Sieg-durch-Aufgabe für den verbleibenden Spieler enden (Status → `finished`), und dieses Ergebnis MUSS regulär gewertet werden (Statistik gemäß FR-024/FR-025).
- **FR-011**: Das System MUSS Lobbys, denen innerhalb von 10 Minuten kein zweiter Spieler beitritt, automatisch schließen.
- **FR-011a**: Verlässt vor Spielstart (`waiting`/`placing`) der Host (Ersteller) die Lobby oder verliert die Verbindung, MUSS die Lobby geschlossen werden. Verlässt der beigetretene zweite Spieler, MUSS sein Sitz freigegeben werden und die Lobby zu `waiting` zurückkehren.

**Server-autoritative Spiellogik & Fog of War**

- **FR-012**: Die gesamte regelrelevante Spiellogik (Platzierungs-Validierung, Trefferauswertung, Zugreihenfolge, Extrazug-Regel, Sieg-/Niederlageerkennung) MUSS serverseitig unter Verwendung der bestehenden Engine als Single Source of Truth erfolgen. Der Client sendet nur Zug-/Aktionsabsichten.
- **FR-013**: Der Server DARF einem Client NIEMALS die ungetroffenen Schiffspositionen des Gegners senden. Jeder Spieler erhält ausschließlich seine eigene Flotte, seine bisherigen Schüsse und – über den Gegner – nur bereits getroffene/versenkte Felder.
- **FR-014**: Der Server MUSS jeden Schuss validieren: Ist der Spieler am Zug? Liegt das Feld im Spielfeld? Wurde das Feld noch nicht beschossen? Befindet sich die Partie im Status `in_progress`?
- **FR-015**: Der Server MUSS jede Platzierung gegen Flottenzusammensetzung, Feldgrenzen, Überlappungsfreiheit und die Berührungsregel der Lobby validieren und ungültige Platzierungen ablehnen.
- **FR-016**: Bei aktivierter Extrazug-Regel MUSS derselbe Spieler nach einem Treffer am Zug bleiben und bei einem Fehlschuss („miss") der Zug wechseln; bei deaktivierter Regel MUSS der Zug nach jedem Schuss wechseln.
- **FR-017**: Das System MUSS doppelt eingehende Züge (z. B. durch Lag/Re-Send) idempotent behandeln, sodass ein Zug höchstens einmal gewertet wird.

**Echtzeit-Updates**

- **FR-018**: Das System MUSS Spielereignisse in Echtzeit an beide Spieler verteilen: Beitritt/Verbindungsstatus, „Schiffe platziert", Zugwechsel (wer am Zug ist), jeder Schuss und sein Ergebnis (Wasser/Treffer/versenkt) sowie das Spielende mit Sieger.
- **FR-019**: Jeder Spieler MUSS in Echtzeit seinen eigenen und den gegnerischen Status sehen (verbunden, Schiffe platziert, am Zug) – im Rahmen des Fog of War (FR-013).

**Zug-Timer**

- **FR-020**: Bei aktiviertem Timer MUSS der Server pro Zug ein Zeitlimit messen und beiden Spielern einen Countdown sichtbar machen, dessen verbleibende Zeit der Server bestimmt.
- **FR-021**: Läuft der Timer ab, MUSS der Zug ohne automatischen Schuss verfallen und der Gegner am Zug sein; beide Spieler werden live informiert.
- **FR-022**: Bei einem Treffer mit aktivierter Extrazug-Regel MUSS der Timer für den nächsten Schuss desselben Spielers neu starten.
- **FR-023**: Bei Timer-Einstellung „aus" DARF kein Zug automatisch verfallen.

**Statistik**

- **FR-024**: Bei regulärem Partieende MUSS das Ergebnis in die Statistik jedes beteiligten eingeloggten Spielers geschrieben werden – auch wenn der Gegner ein Gast war.
- **FR-025**: Für Gäste DARF KEINE Statistik geführt oder persistiert werden.
- **FR-026**: Das Schreiben des Partieergebnisses in die Statistik MUSS idempotent sein (ein Ergebnis zählt genau einmal, auch bei wiederholter Meldung).

**Abgrenzung**

- **FR-027**: Reconnect-Handling und Quick-Play/Matchmaking sind NICHT Teil dieses Features.

### Key Entities *(include if feature involves data)*

- **Lobby**: Ein privater Raum für genau zwei Spieler. Attribute: Lobby-Code, Status (`waiting`/`placing`/`in_progress`/`finished`), Ersteller (eingeloggter Spieler), gewählte Einstellungen (Berührung, Zug-Timer, Extrazug), Erstellungszeitpunkt. Flüchtiger Live-Zustand.
- **Lobby-Teilnehmer / Spielersitz**: Ein Sitz in der Lobby, belegt durch einen eingeloggten Spieler oder einen Gast. Attribute: Identitätsbezug (Nutzer-ID oder Gast-Token mit temporärem Anzeigenamen), Verbindungsstatus, „Schiffe platziert"-Status, ob aktuell am Zug.
- **Partie-/Spielzustand**: Der server-autoritative Zustand der laufenden Partie. Attribute: beide Flotten/Boards, bisherige Schüsse je Spieler mit Ergebnis, aktueller Zug, aktiver Timer-Stand, angewandte Lobby-Einstellungen, Sieger (nach Ende). Quelle der Wahrheit ist die bestehende Engine.
- **Schuss/Zug**: Eine Zug-Absicht eines Spielers auf ein Zielfeld, mit einer Identität zur Idempotenz; nach Auswertung mit Ergebnis (Wasser/Treffer/versenkt).
- **Partieergebnis (für Statistik)**: Das Endergebnis einer Partie (Sieger/Verlierer), das je eingeloggtem Spieler genau einmal in dessen Statistik einfließt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zwei Menschen können eine vollständige PvP-Partie von der Lobby-Erstellung über die Platzierung bis zur Sieger-Ermittlung ohne Blockaden zu Ende spielen.
- **SC-002**: Ein eingeloggter Spieler kann eine Lobby erstellen und einen Code erhalten, und ein zweiter Spieler kann mit diesem Code in unter 30 Sekunden beitreten.
- **SC-003**: In 100 % der Fälle enthalten die an einen Client gesendeten Daten keine ungetroffenen gegnerischen Schiffspositionen (Fog of War nachweislich serverseitig erzwungen).
- **SC-004**: 100 % der regelrelevanten Entscheidungen (Treffer, Zugwechsel, Sieg) werden vom Server bestimmt; ein manipulierter Client kann den Spielausgang nicht beeinflussen.
- **SC-005**: Schussergebnisse erscheinen bei beiden Spielern als Live-Update typischerweise innerhalb von 1 Sekunde nach dem Zug.
- **SC-006**: Ein abgelaufener Zug-Timer führt in 100 % der Fälle zum Zugwechsel ohne automatischen Schuss; nach einem Treffer wird der Countdown neu gestartet.
- **SC-007**: Nach jeder regulär beendeten Partie ist die Statistik jedes beteiligten eingeloggten Spielers genau einmal aktualisiert; Gäste haben keinen Statistikeintrag.
- **SC-008**: Doppelt gesendete Züge führen in 0 % der Fälle zu einem doppelt gewerteten Schuss.
- **SC-009**: Das System unterstützt mindestens mehrere Dutzend gleichzeitige Partien (Richtwert ≥ 50) auf einer einzelnen Server-Instanz, ohne dass Live-Updates die in SC-005 genannte Reaktionszeit überschreiten; verifiziert per Nebenläufigkeits-Smoke (kein Lasttest-Infrastrukturaufbau). Horizontale Skalierung über mehrere Instanzen ist kein Ziel dieses Features.

## Assumptions

- **Bestehende Identität/Persistenz (Meilenstein 2) wird wiederverwendet**: Login eingeloggter Spieler, Gast-Identität (temporärer Name/Token) und der Statistik-Mechanismus existieren bereits und werden hier konsumiert, nicht neu gebaut.
- **Bestehende Engine ist die Single Source of Truth**: Spielregeln (Platzierung, Schussauswertung, Sieg, Berührungs-/Extrazug-Optionen) stammen aus der vorhandenen, unveränderten Engine; dieses Feature trifft keine eigenständige Regelentscheidung.
- **Standardvariante des Spielfelds**: 10×10-Feld und klassische Flotte (1×5, 1×4, 2×3, 1×3, 1×2) gemäß Projektspezifikation, sofern in der Lobby nicht anders vorgesehen. Alternative Feldgrößen/Flotten sind nicht Teil dieses Features.
- **Timer-Stufen & Standard**: Auswählbare Zug-Timer-Dauern sind 15 / 30 / 60 s und „aus"; Standardwert 30 s (siehe Clarifications, gemäß Projektspezifikation Abschnitt 6.3).
- **Lobby-Inaktivitäts-Timeout**: Eine Lobby ohne zweiten Beitritt wird nach 10 Minuten automatisch geschlossen (siehe Clarifications).
- **Kein neues visuelles Design**: Es wird kein neues UI-Design eingeführt; bestehende Darstellungsmuster werden genutzt.
- **Genau zwei Spieler pro Lobby**: Zuschauer/Spectator sind nicht Teil dieses Features.
- **Einzelinstanz-Betrieb**: Das Feature zielt auf eine einzelne Server-Instanz mit mehreren Dutzend gleichzeitigen Partien; horizontale Skalierung über mehrere Instanzen ist nicht Teil dieses Features.
- **Minimales Anti-Abuse**: Enthalten sind nur Drosselung von Beitritts-Versuchen (Code-Erraten) und eine Obergrenze offener Lobbys pro Nutzer; weitergehendes Rate-Limiting/Filtering ist Folge-Feature.
- **Server-Verfügbarkeit & Disconnect**: Da Reconnect ausdrücklich ausgeklammert ist, beendet ein Verbindungsverlust oder Verlassen während der Partie diese sofort als Sieg-durch-Aufgabe für den verbleibenden Spieler (gewertet). Ein Wiedereintritt in eine laufende Partie ist nicht vorgesehen (Folge-Feature).
