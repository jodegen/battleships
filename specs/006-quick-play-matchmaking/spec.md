# Feature Specification: Quick Play – öffentliches Matchmaking

**Feature Branch**: `006-quick-play-matchmaking`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Feature: Quick Play – öffentliches Matchmaking. Aufbauend auf dem bestehenden PvP-System (Lobbys, Socket.IO, server-autoritative Engine, Redis, Reconnect). Nur eingeloggte Spieler. Warteschlange, First-come-Paarung, interne Lobby mit Standard-Einstellungen, dann normale PvP-Partie. Suche abbrechbar bis zur Paarung. Keine ELO-Paarung in v1."

## Clarifications

### Session 2026-06-06

- Q: Darf ein eingeloggter Spieler der Quick-Play-Warteschlange beitreten, während er bereits in einer anderen Lobby oder laufenden Partie ist? → A: Nein — blockieren. Ein Spieler mit aktiver Partie oder offener Lobby kann der Warteschlange nicht beitreten (Beitritt wird mit Hinweis abgelehnt).
- Q: Soll ein allein wartender Spieler unbegrenzt warten oder nach einem Timeout automatisch entfernt werden? → A: Nach Timeout entfernen — fester Wert **120 Sekunden**; danach verlässt der Spieler die Warteschlange und erhält einen Hinweis „kein Match gefunden" (erneute Suche möglich).
- Q: Was passiert, wenn ein noch nicht gepaarter Spieler die Verbindung verliert oder den Tab schließt? → A: Still aus der Warteschlange entfernen — es entsteht keine Partie und kein Statistik-Eintrag.
- Q: Wie wird der Race-Fall behandelt, wenn mehrere Spieler exakt gleichzeitig suchen? → A: Die Paarung MUSS atomar erfolgen, sodass jeder Spieler in höchstens eine Paarung aufgenommen wird und niemand zwei Partien gleichzeitig erhält.
- Q: Darf jemand gleichzeitig in der Warteschlange stehen und eine andere Partie laufen haben? → A: Nein — wer bereits in einer Partie (oder offenen Lobby) ist, kann nicht zusätzlich suchen (bestätigt FR-015).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Zwei Spieler werden automatisch gepaart (Priority: P1)

Ein eingeloggter Spieler möchte schnell gegen einen beliebigen anderen Spieler spielen, ohne
einen Lobby-Code austauschen zu müssen. Er startet die Suche ("Match suchen"). Sobald ein
zweiter suchender Spieler vorhanden ist, paart das System beide automatisch, erstellt im
Hintergrund eine Partie mit Standard-Einstellungen und überführt beide direkt in die
Schiffsplatzierung — ohne weiteren Eingriff.

**Why this priority**: Das ist der Kern des Features. Ohne automatische Paarung gibt es kein
Quick Play. Diese Story liefert für sich genommen den gesamten Nutzwert: schnelles Finden eines
Gegners und Übergang in eine reguläre Partie.

**Independent Test**: Zwei eingeloggte Spieler treten nacheinander der Warteschlange bei; es
lässt sich verifizieren, dass beide ohne Code-Austausch gemeinsam in der Schiffsplatzierung
derselben Partie landen und die Partie Standard-Einstellungen verwendet.

**Acceptance Scenarios**:

1. **Given** ein eingeloggter Spieler A wartet bereits in der Warteschlange, **When** ein
   zweiter eingeloggter Spieler B der Warteschlange beitritt, **Then** werden A und B sofort
   gepaart und beide befinden sich in der Schiffsplatzierungs-Phase derselben Partie.
2. **Given** A und B wurden gepaart, **When** die Partie erstellt wird, **Then** verwendet sie
   die Standard-Einstellungen (Berührung erlaubt, Standard-Timer, Treffer = Extrazug aktiviert)
   und es ist kein Lobby-Code-Austausch erforderlich.
3. **Given** A und B haben ihre Schiffe platziert, **When** die Partie beginnt, **Then** läuft
   sie als ganz normale PvP-Partie ab (gleicher Spielablauf, Timer, Reconnect, Statistik) wie
   eine per Code erstellte Lobby.
4. **Given** die Warteschlange ist leer, **When** Spieler A der Warteschlange beitritt, **Then**
   sieht A einen Wartestatus und bleibt suchend, bis ein zweiter Spieler erscheint.

---

### User Story 2 - Suche abbrechen vor der Paarung (Priority: P2)

Ein wartender Spieler möchte die Suche abbrechen können, solange er noch keinen Gegner gefunden
hat, und damit die Warteschlange verlassen, ohne in eine Partie überführt zu werden.

**Why this priority**: Notwendig für eine akzeptable Nutzererfahrung (kein „Feststecken" in der
Warteschlange), aber ohne die Paarung aus Story 1 wertlos.

**Independent Test**: Ein Spieler tritt der Warteschlange bei und bricht ab; es lässt sich
verifizieren, dass er nicht mehr suchend ist und durch eine spätere Paarung nicht mehr erfasst
wird.

**Acceptance Scenarios**:

1. **Given** Spieler A wartet in der Warteschlange und ist noch nicht gepaart, **When** A die
   Suche abbricht, **Then** verlässt A die Warteschlange und gilt nicht mehr als suchend.
2. **Given** A hat die Suche abgebrochen, **When** danach ein weiterer Spieler die Warteschlange
   betritt, **Then** wird A nicht in eine Paarung einbezogen.
3. **Given** A wurde bereits mit B gepaart (die Partie wurde erzeugt), **When** A versucht, die
   Suche abzubrechen, **Then** ist kein Abbruch der Suche mehr möglich — der Austritt folgt ab
   diesem Punkt den bestehenden Regeln einer laufenden PvP-Partie.

---

### User Story 3 - Gäste haben keinen Zugang (Priority: P2)

Ein nicht eingeloggter Spieler (Gast) soll Quick Play nicht nutzen können und stattdessen auf
den Lobby-Code-Weg verwiesen werden.

**Why this priority**: Klare Zugangsgrenze, die das bestehende Berechtigungsmodell (Abschnitt 3
der Projektspezifikation) wahrt. Wichtig für Korrektheit, aber kein eigenständiger Nutzwert.

**Independent Test**: Ein Gast versucht, der Warteschlange beizutreten; es lässt sich
verifizieren, dass der Beitritt abgelehnt wird und der Gast nicht in der Warteschlange erscheint.

**Acceptance Scenarios**:

1. **Given** ein nicht eingeloggter Gast, **When** er versucht, der Quick-Play-Warteschlange
   beizutreten, **Then** wird der Beitritt abgelehnt und er erhält keinen Wartestatus.
2. **Given** ein Gast, **When** ihm die verfügbaren Spielmodi angezeigt werden, **Then** bleibt
   der PvP-Zugang per Lobby-Code unverändert verfügbar.

---

### Edge Cases

- **Doppelter Beitritt**: Ein bereits suchender Spieler tritt erneut bei (z. B. zweiter Tab /
  Doppelklick) → er besetzt keinen zweiten Wartelistenplatz und kann nicht mit sich selbst
  gepaart werden.
- **Genau ein Wartender**: Steht nur ein Spieler in der Warteschlange, bleibt er suchend, bis
  ein zweiter erscheint oder der 120-Sekunden-Timeout greift (kein Match gegen die KI).
- **Wartelisten-Timeout**: Findet sich innerhalb von 120 Sekunden kein Gegner, wird der Spieler
  automatisch aus der Warteschlange entfernt, erhält den Hinweis „kein Match gefunden" und kann
  erneut suchen.
- **Beitritt trotz bestehender Bindung**: Versucht ein Spieler beizutreten, während er in einer
  laufenden Partie oder einer offenen Lobby ist, wird der Beitritt abgelehnt und er belegt keinen
  Wartelistenplatz.
- **Trennung / Tab-Schließen während des Wartens**: Verliert ein wartender, noch nicht
  gepaarter Spieler die Verbindung oder schließt den Tab, wird er still aus der Warteschlange
  entfernt — keine Partie, kein Statistik-Eintrag. Reconnect betrifft laufende Partien, nicht
  die Warteschlange; eine erneute Suche ist nötig.
- **Gleichzeitiger Beitritt**: Treten mehrere Spieler praktisch gleichzeitig bei, paart das
  System sie eindeutig paarweise; kein Spieler wird in zwei Paarungen gleichzeitig aufgenommen
  und keiner bleibt fälschlich allein zurück, wenn ein Partner verfügbar ist.
- **Ungerade Anzahl**: Bei einer ungeraden Anzahl suchender Spieler bleibt genau einer
  wartend, bis der nächste Spieler beitritt.
- **Abbruch genau im Paarungsmoment**: Ein Abbruchversuch, der mit der Paarung zusammenfällt,
  führt entweder zum sauberen Verlassen der Warteschlange (noch nicht gepaart) oder wird
  abgelehnt (bereits gepaart) — niemals zu einer halb erzeugten Partie.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Quick Play MUSS ausschließlich eingeloggten Spielern zur Verfügung stehen;
  Gästen MUSS der Beitritt zur Warteschlange verwehrt werden.
- **FR-002**: Ein eingeloggter Spieler MUSS der Quick-Play-Warteschlange beitreten können
  ("Match suchen") und danach einen Wartestatus erhalten.
- **FR-003**: Sobald mindestens zwei suchende Spieler vorhanden sind, MUSS das System zwei von
  ihnen automatisch paaren, ohne dass ein Lobby-Code ausgetauscht wird.
- **FR-004**: Die Paarung in v1 MUSS nach dem First-come-Prinzip erfolgen (frühest Wartende
  zuerst); es findet KEINE ELO-/Skill-basierte Paarung statt.
- **FR-005**: Die Paarung MUSS intern eine reguläre Partie mit den Standard-Einstellungen
  erzeugen: Berührung von Schiffen erlaubt, Standard-Zug-Timer, „Treffer = Extrazug" aktiviert.
- **FR-006**: Beide gepaarten Spieler MÜSSEN unmittelbar nach der Paarung gemeinsam in die
  Schiffsplatzierungs-Phase überführt werden, ohne zusätzlichen Bestätigungs- oder
  Code-Eingabeschritt.
- **FR-007**: Ab dem Beginn der Partie MUSS sich die Quick-Play-Partie identisch zu einer per
  Lobby-Code erzeugten PvP-Partie verhalten — gleicher Spielablauf, gleiche Zug-Timer-Regeln,
  gleiches Reconnect-Verhalten und gleiche Statistik-Aktualisierung.
- **FR-008**: Ein wartender Spieler MUSS die Suche abbrechen können, solange er noch nicht
  gepaart wurde, und verlässt damit die Warteschlange.
- **FR-009**: Nach einem Abbruch MUSS der Spieler aus der Warteschlange entfernt sein und darf
  in keine nachfolgende Paarung einbezogen werden.
- **FR-010**: Sobald ein Spieler gepaart wurde, MUSS ein Abbruch der *Suche* nicht mehr möglich
  sein; ein Verlassen folgt ab diesem Punkt den bestehenden Regeln laufender PvP-Partien.
- **FR-011**: Ein einzelner Spieler DARF NICHT mit sich selbst gepaart werden und DARF nicht
  mehr als einen Platz in der Warteschlange belegen, auch bei wiederholtem Beitritt.
- **FR-012**: Die Paarung MUSS atomar erfolgen: Auch wenn mehrere Spieler praktisch gleichzeitig
  suchen, MUSS jeder Spieler zu jedem Zeitpunkt höchstens einer Paarung zugeordnet sein; ein
  Spieler DARF NICHT in zwei Paarungen aufgenommen werden oder zwei Partien gleichzeitig
  erhalten, und es darf keine doppelte oder widersprüchliche Zuordnung entstehen.
- **FR-013**: Verliert ein noch nicht gepaarter, wartender Spieler die Verbindung oder schließt
  den Tab, MUSS er still aus der Warteschlange entfernt werden (Platz freigegeben, Suche
  beendet); dabei DARF weder eine Partie entstehen noch ein Statistik-Eintrag geschrieben werden.
- **FR-014**: Das System MUSS dem wartenden Spieler erkennbar machen, dass die Suche läuft, und
  beim Übergang in die Partie einen eindeutigen Statuswechsel signalisieren.
- **FR-015**: Das System MUSS den Beitritt zur Warteschlange ablehnen, wenn der Spieler bereits
  in einer laufenden Partie ist oder eine offene (noch nicht beendete) Lobby besitzt; die
  Ablehnung MUSS mit einem erkennbaren Hinweis erfolgen.
- **FR-016**: Ein allein wartender Spieler MUSS nach 120 Sekunden ohne Paarung automatisch aus
  der Warteschlange entfernt werden und einen Hinweis „kein Match gefunden" erhalten; eine
  erneute Suche MUSS danach möglich sein.

### Key Entities *(include if feature involves data)*

- **Warteschlangen-Eintrag (Quick-Play-Queue-Eintrag)**: Repräsentiert einen eingeloggten
  Spieler, der aktuell nach einem Match sucht. Wesentliche Merkmale: Identität des Spielers,
  Zeitpunkt des Beitritts (für First-come-Reihenfolge), Suchstatus. Höchstens ein aktiver
  Eintrag pro Spieler.
- **Gepaarte Partie**: Das Ergebnis einer erfolgreichen Paarung — eine reguläre PvP-Partie mit
  Standard-Einstellungen, die ab der Schiffsplatzierung nicht mehr von einer per Code erzeugten
  Lobby unterscheidbar ist. Verknüpft genau zwei gepaarte Spieler.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Stehen zwei eingeloggte Spieler gleichzeitig in der Warteschlange, werden sie in
  unter 2 Sekunden gepaart und befinden sich gemeinsam in der Schiffsplatzierung.
- **SC-002**: Ein Spieler kann ein Match starten und ohne jeglichen Code-Austausch in eine
  Partie gelangen (0 manuelle Code-Eingaben).
- **SC-003**: 100 % der über Quick Play erzeugten Partien verwenden die Standard-Einstellungen
  (Berührung erlaubt, Standard-Timer, Treffer = Extrazug) und durchlaufen denselben Ablauf wie
  per Code erstellte Lobbys.
- **SC-004**: 100 % der Gast-Versuche, Quick Play zu nutzen, werden abgelehnt, ohne einen
  Wartelistenplatz zu belegen.
- **SC-005**: Ein Abbruch der Suche vor der Paarung entfernt den Spieler in unter 1 Sekunde aus
  der Warteschlange, und er wird in keine nachfolgende Paarung einbezogen.
- **SC-006**: In keinem Paarungsablauf — auch bei gleichzeitigem Beitritt mehrerer Spieler —
  wird ein Spieler zwei Partien zugeordnet oder mit sich selbst gepaart (0 Fehlpaarungen).
- **SC-007**: 100 % der Beitrittsversuche von Spielern mit aktiver Partie oder offener Lobby
  werden abgelehnt, ohne einen Wartelistenplatz zu belegen.
- **SC-008**: Findet sich kein Gegner, wird ein wartender Spieler nach 120 Sekunden (±
  Toleranz) automatisch entfernt und erhält den Hinweis „kein Match gefunden".
- **SC-009**: Verliert ein noch nicht gepaarter Spieler die Verbindung oder schließt den Tab,
  entsteht in 100 % der Fälle weder eine Partie noch ein Statistik-Eintrag.

## Assumptions

- Das bestehende PvP-System (Lobbys, server-autoritative Engine, Echtzeit-Transport,
  Reconnect-Handling und Statistik-Aktualisierung) ist vorhanden und wird wiederverwendet; Quick
  Play ergänzt lediglich den Weg in eine Partie und ändert den Partieverlauf nicht.
- „Standard-Einstellungen" entsprechen den in der Projektspezifikation/Lobby-Defaults
  definierten Werten: Berührung von Schiffen erlaubt, Standard-Zug-Timer, „Treffer = Extrazug"
  aktiviert.
- Authentifizierung/Identität ist bereits gelöst; Quick Play stützt sich auf die bestehende
  Unterscheidung eingeloggter Spieler vs. Gast.
- In v1 gibt es keinen Fallback gegen die KI. Ein einzelner Wartender bleibt suchend, bis ein
  zweiter Spieler erscheint, er selbst abbricht, die Verbindung verliert oder der
  120-Sekunden-Timeout (FR-016) greift.
- Ein Spieler kann zu einem Zeitpunkt nur in genau einem Spielkontext gebunden sein: Der
  Beitritt zur Quick-Play-Warteschlange ist nur möglich, wenn er weder in einer laufenden Partie
  noch in einer offenen Lobby ist (FR-015).
- Die Reihenfolge der Paarung ist First-come (Beitrittszeitpunkt); ELO-/Skill-basiertes
  Matchmaking ist explizit out of scope und für später vorgesehen.
- Es entsteht kein neues visuelles Design; bestehende UI-Muster für Warte-/Partiezustände werden
  wiederverwendet.
