# Feature Specification: Reconnect-Handling für laufende PvP-Partien

**Feature Branch**: `005-reconnect-handling`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Reconnect-Handling für laufende PvP-Partien. Aufbauend auf dem bestehenden Echtzeit-PvP (Socket.IO, server-autoritative Engine, Redis-State). Pro Spieler ein Reconnect-Token; bei Verbindungsabbruch bleibt der Sitzplatz 60 s reserviert, der Gegner sieht 'Gegner getrennt – wartet (xx s)' mit Countdown; Reconnect innerhalb 60 s stellt den vollständigen, für den Spieler sichtbaren Zustand aus Redis wieder her (Fog of War gewahrt); Zug-Timer pausiert während des Reconnect-Fensters; Ablauf des Fensters = Aufgabe (verbliebener Spieler gewinnt, Statistik eingeloggter Spieler aktualisiert); Gäste können reconnecten solange das Session-Token im Browser überlebt. Kein Quick-Play, kein neues visuelles Design."

## Clarifications

### Session 2026-06-06

- Q: Wie wird gewertet, wenn beide Spieler gleichzeitig getrennt sind und ihre 60-s-Fenster ablaufen? → A: Erstes ablaufendes Fenster entscheidet — dieser Spieler gilt als aufgegeben, der andere gewinnt (auch wenn er selbst noch getrennt ist). Ein einziger, deterministischer Wertungspfad.
- Q: Soll wiederholtes Trennen/Reconnecten begrenzt werden (Anti-Stalling)? → A: Keine Begrenzung in diesem Feature (MVP). Jede Trennung erhält ein frisches 60-s-Fenster; breiteres Anti-Abuse bleibt Folge-Feature (konsistent mit Feature 004). Stalling ist akzeptiertes Restrisiko.
- Q: Von wo darf ein eingeloggter Spieler reconnecten? → A: Konto-weit von jedem Gerät/Browser per Login (Reconnect-Anrecht an Konto + Partie gebunden). Gäste nur aus derselben Browser-Session.

## User Scenarios & Testing *(mandatory)*

<!--
  Reconnect ist die in der Projektspezifikation (§2.2, §10) als Pflicht markierte
  Robustheits-Funktion (Roadmap-Meilenstein 4). Sie löst die in Feature 004
  getroffene Übergangsentscheidung FR-010a ("sofortiger Sieg-durch-Aufgabe bei
  Verbindungsverlust während in_progress") für die laufende Partie ab: Statt
  sofortiger Wertung gibt es nun ein Reconnect-Fenster.
-->

### User Story 1 - Innerhalb des Fensters zurückkehren und weiterspielen (Priority: P1)

Während einer laufenden Partie (`in_progress`) verliert ein Spieler die Verbindung (Tab-Reload, kurzer Netzaussetzer, WLAN-Wechsel). Sein Sitzplatz bleibt reserviert. Der Spieler kehrt innerhalb des Reconnect-Fensters zurück und erhält seinen vollständigen, für ihn sichtbaren Spielzustand zurück (eigene Flotte, eigene bisherige Schüsse samt Ergebnissen, wessen Zug, verbleibende Timer-Zeit) — ohne jemals ungetroffene gegnerische Schiffe zu sehen. Die Partie wird ohne Verlust für beide Spieler fortgesetzt.

**Why this priority**: Dies ist der Kern des Features und allein bereits wertvoll. Ohne Wiederherstellung des Spielzustands nach einem Verbindungsabbruch ist jede Partie durch den kleinsten Netz-Aussetzer verloren — die häufigste Frustquelle in Echtzeit-Browserspielen. Für sich genommen demonstrierbar.

**Independent Test**: Eine Partie zwischen zwei Clients starten, in `in_progress` bringen, einen Client die Verbindung trennen lassen und ihn vor Ablauf des Fensters mit seinem Reconnect-Token neu verbinden. Verifizierbar daran, dass der zurückkehrende Client genau seinen vorherigen sichtbaren Zustand erhält (eigene Schiffe, eigene Trefferhistorie, aktueller Zug-Inhaber, Restzeit) und die Partie normal weiterläuft.

**Acceptance Scenarios**:

1. **Given** eine laufende Partie, **When** ein Spieler die Verbindung verliert und sich innerhalb des Reconnect-Fensters mit gültigem Reconnect-Token neu verbindet, **Then** wird ihm sein vollständiger, für ihn sichtbarer Spielzustand neu zugestellt und die Partie läuft normal weiter.
2. **Given** ein zurückkehrender Spieler, **When** sein Zustand wiederhergestellt wird, **Then** enthält dieser ausschließlich für ihn sichtbare Informationen — niemals Position oder Existenz ungetroffener gegnerischer Schiffe (Fog of War gewahrt).
3. **Given** ein Spieler ist gerade am Zug und verliert die Verbindung, **When** er innerhalb des Fensters zurückkehrt, **Then** ist weiterhin er am Zug und ihm steht die zum Zeitpunkt des Abbruchs verbleibende Timer-Zeit zur Verfügung.
4. **Given** der Gegner war am Zug, als ein Spieler die Verbindung verlor, **When** dieser Spieler zurückkehrt, **Then** zeigt sein wiederhergestellter Zustand korrekt den Gegner als Zug-Inhaber.

---

### User Story 2 - Der verbliebene Spieler sieht den Trennungsstatus mit Countdown (Priority: P2)

Während einer laufenden Partie verliert der Gegner die Verbindung. Der verbliebene Spieler wird sofort informiert: Er sieht den Status "Gegner getrennt – wartet (xx s)" mit einem sichtbaren, herunterzählenden Countdown. Solange das Fenster läuft, ist die Partie angehalten und es kann nicht gezogen werden. Kehrt der Gegner zurück, verschwindet der Hinweis und das Spiel wird fortgesetzt.

**Why this priority**: Ohne klare Rückmeldung weiß der verbliebene Spieler nicht, ob die Partie eingefroren, abgestürzt oder beendet ist. Der sichtbare Countdown macht die Wartezeit erträglich und vorhersehbar. Setzt auf US1 auf, ist aber unabhängig testbar.

**Independent Test**: Mit zwei Clients eine Partie in `in_progress` bringen, einen Client trennen und beim verbliebenen Client prüfen, dass die Trennungs-Statusmeldung mit herunterzählendem Countdown erscheint und beim Reconnect des Gegners wieder verschwindet.

**Acceptance Scenarios**:

1. **Given** eine laufende Partie, **When** der Gegner die Verbindung verliert, **Then** sieht der verbliebene Spieler unverzüglich den Status "Gegner getrennt – wartet (xx s)" mit sichtbarem, herunterzählendem Countdown.
2. **Given** der verbliebene Spieler sieht den Trennungs-Countdown, **When** der Gegner innerhalb des Fensters zurückkehrt, **Then** verschwindet der Hinweis und die Partie wird für beide fortgesetzt.
3. **Given** ein Spieler ist getrennt und sein Reconnect-Fenster läuft, **When** der verbliebene Spieler einen Zug zu machen versucht, **Then** wird der Zug nicht angenommen, solange die Partie pausiert ist.

---

### User Story 3 - Ablauf des Fensters wertet die Partie als Aufgabe (Priority: P2)

Ein getrennter Spieler kehrt nicht innerhalb des Reconnect-Fensters zurück. Mit Ablauf des Countdowns gilt die Partie als aufgegeben: Der verbliebene Spieler gewinnt. Die Partie wird regulär abgeschlossen, und die Statistik der eingeloggten Spieler wird entsprechend fortgeschrieben (Sieg bzw. Niederlage). Der verbliebene Spieler wird über das Ergebnis informiert.

**Why this priority**: Schließt den Lebenszyklus ab und verhindert, dass Partien für immer hängen bleiben. Sorgt für faire, eindeutige Wertung bei endgültigem Verlassen. Setzt auf US1/US2 auf, eigenständig prüfbar.

**Independent Test**: Eine Partie in `in_progress` bringen, einen Client trennen und das Fenster vollständig ablaufen lassen, ohne zu reconnecten. Verifizierbar daran, dass die Partie als beendet markiert ist, der verbliebene Spieler als Sieger geführt wird und – sofern eingeloggt – die Statistik beider Spieler korrekt aktualisiert wurde.

**Acceptance Scenarios**:

1. **Given** ein getrennter Spieler, dessen Reconnect-Fenster läuft, **When** das Fenster abläuft, ohne dass er zurückkehrt, **Then** wird die Partie als aufgegeben gewertet und der verbliebene Spieler gewinnt.
2. **Given** beide Spieler sind eingeloggt, **When** die Partie durch Fenster-Ablauf endet, **Then** wird die Statistik beider entsprechend (Sieg/Niederlage) fortgeschrieben.
3. **Given** ein eingeloggter und ein Gast-Spieler, **When** die Partie durch Fenster-Ablauf endet, **Then** wird nur die Statistik des eingeloggten Spielers fortgeschrieben (Gäste führen keine Statistik).
4. **Given** der getrennte Spieler versucht, sich nach Ablauf des Fensters mit seinem Reconnect-Token zu verbinden, **When** die Partie bereits als aufgegeben gewertet wurde, **Then** wird er nicht in die Partie zurückgeführt, sondern erhält das (beendete) Endergebnis.

---

### User Story 4 - Zug-Timer pausiert während des Reconnect-Fensters (Priority: P3)

Verliert ein Spieler die Verbindung, während der Zug-Timer läuft, friert der Zug-Timer für die Dauer des Reconnect-Fensters ein. Kehrt der Spieler zurück, läuft der Zug-Timer mit exakt der zum Zeitpunkt des Abbruchs verbliebenen Restzeit weiter. So verliert niemand seinen Zug allein dadurch, dass er kurz getrennt war.

**Why this priority**: Verhindert eine unfaire Wechselwirkung zwischen Zug-Timer und Verbindungsabbruch (ein Aussetzer würde sonst den Zug kosten). Wichtig für Fairness, baut aber auf der bestehenden Timer-Mechanik und US1 auf.

**Independent Test**: Eine Partie mit aktivem Zug-Timer in `in_progress` bringen, den Spieler am Zug trennen, eine Zeit warten (kürzer als das Fenster), reconnecten und prüfen, dass die Zug-Restzeit der zum Trennungszeitpunkt verbliebenen Zeit entspricht (nicht heruntergelaufen ist).

**Acceptance Scenarios**:

1. **Given** der Zug-Timer läuft und der Spieler am Zug verliert die Verbindung, **When** das Reconnect-Fenster läuft, **Then** läuft der Zug-Timer nicht weiter (er pausiert).
2. **Given** ein pausierter Zug-Timer, **When** der getrennte Spieler innerhalb des Fensters zurückkehrt, **Then** läuft der Zug-Timer mit der zum Trennungszeitpunkt verbliebenen Restzeit weiter.
3. **Given** in der Lobby ist der Zug-Timer auf "aus" gestellt, **When** ein Spieler getrennt wird und zurückkehrt, **Then** läuft die Partie ohne Zug-Zeitlimit normal weiter (keine Timer-bezogene Wertung).

---

### Edge Cases

- **Reconnect mit ungültigem/fremdem Token**: Ein Verbindungsversuch mit fehlendem, abgelaufenem, gefälschtem oder zu einer anderen Partie/zu einem anderen Sitz gehörendem Reconnect-Token wird abgelehnt; der Sitzplatz wird nicht übernommen.
- **Beide Spieler gleichzeitig getrennt**: Verlieren beide Spieler die Verbindung, pausiert die Partie, und für jeden läuft sein eigenes Reconnect-Fenster. Das **zuerst ablaufende** Fenster entscheidet: Dieser Spieler gilt als aufgegeben, der andere gewinnt — auch wenn der andere zu diesem Zeitpunkt selbst noch getrennt ist (siehe FR-014a).
- **Doppelte Verbindung / Token-Wiederverwendung**: Stellt derselbe Spieler eine zweite aktive Verbindung mit demselben Reconnect-Token her (z. B. zweiter Tab), bleibt genau eine Verbindung für den Sitzplatz autoritativ; die ältere/überzählige Verbindung wird ersetzt, ohne den Sitz freizugeben.
- **Sofortige Wiederverbindung (Flackern)**: Sehr kurze Aussetzer (Verbindung kehrt innerhalb von Sekunden zurück) führen zu nahtloser Wiederherstellung ohne sichtbaren Spielabbruch; der Gegner-Hinweis darf in solchen Fällen sehr kurz oder gar nicht erscheinen.
- **Gast verliert Session-Token**: Verliert ein Gast sein im Browser gespeichertes Session-/Reconnect-Token vollständig (z. B. Inkognito-Tab geschlossen, Storage gelöscht), kann er nicht zurückkehren; sein Fenster läuft ab und die Partie wird als Aufgabe gewertet.
- **Trennung außerhalb von `in_progress`**: Verbindungsverlust in `waiting`/`placing` fällt nicht unter dieses Feature; dort gilt das bestehende Verhalten aus Feature 004 (Host verlässt → Lobby schließt; zweiter Spieler verlässt → Sitz frei, zurück zu `waiting`).
- **Trennung im Moment des Partie-Endes**: Verliert ein Spieler die Verbindung im selben Moment, in dem die Partie regulär endet (letztes Schiff versenkt), bleibt das reguläre Ergebnis maßgeblich; es wird kein Reconnect-Fenster für eine bereits beendete Partie eröffnet.
- **Reconnect nach Server-seitigem Verlust des aktiven Zustands**: Ist der aktive Spielzustand nicht mehr verfügbar (Ablauf/Bereinigung), kann der Spieler nicht in die Partie zurückgeführt werden; ihm wird ein klarer, nicht-irreführender Hinweis angezeigt.

## Requirements *(mandatory)*

### Functional Requirements

**Reconnect-Token & Identifikation**

- **FR-001**: Das System MUSS jedem Spieler beim Eintritt in eine Partie ein Reconnect-Token zuordnen, mit dem er eindeutig seinem Sitzplatz in genau dieser Partie zugeordnet werden kann.
- **FR-002**: Das System MUSS einen Reconnect-Versuch ablehnen, dessen Token fehlt, ungültig, abgelaufen oder nicht zu diesem Sitzplatz/dieser Partie gehörig ist, ohne den reservierten Sitzplatz preiszugeben oder zu übernehmen.
- **FR-003**: Das Reconnect-Token MUSS auf der Client-Seite so überdauern, dass ein Reload oder kurzer Aussetzer es nicht verliert; für Gäste gilt das Reconnect-Anrecht nur so lange, wie das Session-Token im Browser erhalten bleibt.
- **FR-003a**: Für eingeloggte Spieler MUSS das Reconnect-Anrecht an Konto und Partie gebunden sein, sodass sie auch von einem anderen Gerät/Browser per Login in die laufende Partie zurückkehren können (nicht nur aus derselben Browser-Session). Für Gäste bleibt der Reconnect an die ursprüngliche Browser-Session gebunden.

**Trennung erkennen & Sitzplatz reservieren**

- **FR-004**: Das System MUSS einen Verbindungsverlust eines Spielers während einer laufenden Partie (`in_progress`) erkennen und seinen Sitzplatz für die Dauer des Reconnect-Fensters reserviert halten.
- **FR-005**: Das System MUSS bei erkanntem Verbindungsverlust die Partie in einen pausierten Zustand versetzen, in dem keine Spielzüge angenommen werden, bis der Spieler zurückkehrt oder das Fenster abläuft.
- **FR-006**: Das Reconnect-Fenster MUSS 60 Sekunden betragen. Jede neue Trennung eröffnet ein frisches 60-Sekunden-Fenster; die Anzahl der Trennungen/Reconnects pro Spieler wird in diesem Feature nicht begrenzt (kein Anti-Stalling-Mechanismus — Folge-Feature).
- **FR-007**: Das System MUSS den verbliebenen Spieler unverzüglich über die Trennung des Gegners informieren und ihm den Status "Gegner getrennt – wartet (xx s)" mit einem sichtbaren, herunterzählenden Countdown bis zum Fensterende anzeigen.

**Zustand wiederherstellen (Fog of War)**

- **FR-008**: Bei Reconnect innerhalb des Fensters MUSS das System dem zurückkehrenden Spieler seinen vollständigen, für ihn sichtbaren Spielzustand neu zustellen: eigene Flotte und deren Schadenszustand, eigene bisherigen Schüsse samt Ergebnissen (Treffer/Fehlschuss/versenkt), wer aktuell am Zug ist und die verbleibende Zug-Timer-Zeit.
- **FR-009**: Der wiederhergestellte Zustand MUSS Fog of War wahren: Position und Existenz ungetroffener gegnerischer Schiffe dürfen den zurückkehrenden Spieler niemals erreichen; nur bereits durch Treffer/Versenkung aufgedeckte gegnerische Informationen sind enthalten.
- **FR-010**: Nach erfolgreichem Reconnect MUSS das System die Pause aufheben und die Partie für beide Spieler nahtlos fortsetzen, einschließlich Entfernen des Trennungs-Hinweises beim verbliebenen Spieler.

**Zug-Timer pausieren**

- **FR-011**: Solange ein Spieler im Reconnect-Fenster getrennt ist, MUSS der Zug-Timer pausieren (nicht weiterlaufen).
- **FR-012**: Bei erfolgreichem Reconnect MUSS der Zug-Timer mit exakt der zum Trennungszeitpunkt verbliebenen Restzeit fortgesetzt werden.
- **FR-013**: Ist in der Lobby kein Zug-Timer aktiv ("aus"), MUSS die Partie ohne Timer-bezogene Effekte pausieren und fortgesetzt werden.

**Ablauf des Fensters = Aufgabe**

- **FR-014**: Läuft das 60-Sekunden-Fenster ab, ohne dass der getrennte Spieler zurückkehrt, MUSS das System die Partie als aufgegeben werten: der verbliebene Spieler gewinnt und die Partie wird regulär als beendet abgeschlossen.
- **FR-014a**: Sind beide Spieler gleichzeitig getrennt, MUSS das System das zuerst ablaufende Reconnect-Fenster als maßgebliches Ereignis behandeln: Der Spieler dieses Fensters gilt als aufgegeben, der jeweils andere gewinnt — auch wenn dieser zu diesem Zeitpunkt selbst noch getrennt ist. Es gibt genau einen deterministischen Wertungspfad (kein zweiter Endzustand „kein Sieger").
- **FR-015**: Bei Wertung durch Fenster-Ablauf MUSS das System die Statistik eingeloggter Spieler idempotent fortschreiben (Sieg für den verbliebenen, Niederlage für den aufgebenden Spieler); für Gäste wird keine Statistik geführt.
- **FR-016**: Das System MUSS verhindern, dass dieselbe beendete Partie mehr als einmal gewertet wird (keine doppelte Statistik-Fortschreibung), auch wenn Reconnect- und Ablauf-Ereignisse zeitlich zusammenfallen.
- **FR-017**: Versucht ein Spieler nach Ablauf seines Fensters zu reconnecten, MUSS das System ihn nicht in die Partie zurückführen, sondern ihm das beendete Endergebnis mitteilen.

**Abgrenzung & Konsistenz**

- **FR-018**: Dieses Feature MUSS das in Feature 004 für `in_progress` festgelegte Verhalten "sofortiger Sieg-durch-Aufgabe bei Verbindungsverlust" durch das Reconnect-Fenster ersetzen; das Verhalten in `waiting`/`placing` bleibt unverändert.
- **FR-019**: Endet eine Partie regulär (letztes gegnerisches Schiff versenkt) im selben Moment wie ein Verbindungsverlust, MUSS das reguläre Spielergebnis Vorrang vor einer Reconnect-/Aufgabe-Wertung haben.
- **FR-020**: Das System MUSS Fog of War und Server-Autorität auch im Reconnect-Pfad durchgängig wahren: Der wiederhergestellte Zustand wird serverseitig aus der maßgeblichen Spiellogik abgeleitet, nicht vom Client geliefert.

### Key Entities *(include if feature involves data)*

- **Reconnect-Token / Reconnect-Anrecht**: Pro Spieler und Partie eindeutige Berechtigung, die einen zurückkehrenden Spieler seinem Sitzplatz zuordnet. Bei Gästen ist sie an die Browser-Session gebunden (geheimes Token im Browser); bei eingeloggten Spielern an Konto + Partie, sodass die Rückkehr auch von einem anderen Gerät per Login möglich ist. Beziehung: gehört zu genau einem Sitzplatz in genau einer Partie; bleibt für die Lebensdauer der Partie gültig.
- **Sitzplatz-/Verbindungsstatus**: Pro Spieler in einer laufenden Partie geführter Verbindungszustand (verbunden / getrennt mit laufendem Fenster / endgültig verloren) inklusive Fenster-Deadline. Beziehung: gehört zu einem Spieler innerhalb einer Partie.
- **Reconnect-Fenster (Deadline)**: Zeitpunkt, zu dem ein reservierter Sitzplatz verfällt, falls kein Reconnect erfolgt. Beziehung: höchstens eines pro getrenntem Spieler; steuert Pause und Aufgabe-Wertung.
- **Pausierter Zug-Timer-Zustand**: Für die Dauer der Pause festgehaltene verbleibende Zug-Zeit, die bei Reconnect unverändert fortgesetzt wird. Beziehung: gehört zum aktuell laufenden Zug der Partie.
- **Partie-Ergebnis (Aufgabe)**: Endzustand einer durch Fenster-Ablauf beendeten Partie mit Sieger/Verlierer und Wertungsgrund "Aufgabe". Beziehung: schließt die Partie ab und löst die idempotente Statistik-Fortschreibung aus (analog zu regulären Partie-Enden).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ein Spieler, der während einer laufenden Partie die Verbindung verliert und innerhalb von 60 Sekunden zurückkehrt, kann die Partie in 100 % der Fälle ohne Verlust fortsetzen und erhält genau seinen vorherigen sichtbaren Spielzustand zurück.
- **SC-002**: In keinem Reconnect- oder Wiederherstellungs-Pfad erhält ein Spieler Informationen über Position oder Existenz ungetroffener gegnerischer Schiffe (0 Fog-of-War-Verletzungen über die gesamte Testsuite).
- **SC-003**: Der verbliebene Spieler sieht die Trennungsmeldung mit Countdown innerhalb von 2 Sekunden nach dem Verbindungsverlust des Gegners.
- **SC-004**: Nach Reconnect entspricht die verbleibende Zug-Timer-Zeit der zum Trennungszeitpunkt verbliebenen Zeit mit einer Abweichung von höchstens 1 Sekunde; während der Pause läuft der Timer nachweislich nicht weiter.
- **SC-005**: Läuft das 60-Sekunden-Fenster ab, wird die Partie innerhalb von 2 Sekunden nach Fensterende als beendet gewertet, der verbliebene Spieler als Sieger geführt und – bei eingeloggten Spielern – die Statistik in 100 % der Fälle genau einmal fortgeschrieben (keine doppelte Wertung).
- **SC-006**: Ein Gast, dessen Browser-Session erhalten bleibt (Reload/kurzer Aussetzer), kann in 100 % der Fälle zurückkehren; ein Gast, dessen Session vollständig verloren ist, kehrt in 0 % der Fälle zurück und die Partie wird nach Ablauf korrekt als Aufgabe gewertet.
- **SC-007**: Reconnect-Versuche mit ungültigem, abgelaufenem oder fremdem Token werden in 100 % der Fälle abgelehnt, ohne den reservierten Sitzplatz zu übernehmen oder Spielinformationen preiszugeben.

## Assumptions

- **Aufbau auf Feature 004**: Die laufende Partie liegt bereits als server-autoritativer, aus dem aktiven Spielzustand ableitbarer Zustand vor; dieses Feature fügt Reconnect/Pause/Aufgabe hinzu und ersetzt die Übergangsregel FR-010a aus 004 für `in_progress`.
- **Geltungsbereich nur `in_progress`**: Reconnect-Handling gilt ausschließlich für laufende Partien. Verbindungsverlust in `waiting`/`placing` behält das bestehende 004-Verhalten.
- **Fenster fest 60 Sekunden**: Das Reconnect-Fenster ist in diesem Feature nicht konfigurierbar (Projektspezifikation nennt 60 s als Richtwert; hier verbindlich gesetzt).
- **Sichtbare Zustands-Definition**: "Vollständiger, für den Spieler sichtbarer Zustand" umfasst eigene Flotte/Schäden, eigene Schusshistorie samt Ergebnissen, Zug-Inhaber und verbleibende Zug-Timer-Zeit; aufgedeckte gegnerische Informationen ergeben sich allein aus eigenen Treffern/Versenkungen.
- **Beide Spieler getrennt** (geklärt 2026-06-06): Sind beide getrennt, läuft je ein eigenes 60-s-Fenster; das **zuerst ablaufende** Fenster ist maßgeblich — dieser Spieler gilt als aufgebend, der andere gewinnt, auch wenn der andere selbst noch getrennt ist (FR-014a). Bewusst ein einziger deterministischer Wertungspfad, kein Sonder-Endzustand „kein Sieger".
- **Anti-Stalling** (geklärt 2026-06-06): In diesem Feature wird die Anzahl der Trennungen/Reconnects nicht begrenzt; jede Trennung erhält ein frisches 60-s-Fenster. Wiederholtes Trennen zum Pausieren des Zug-Timers ist akzeptiertes Restrisiko; ein Anti-Stalling-Mechanismus bleibt einem späteren Anti-Abuse-Feature vorbehalten (konsistent mit Feature 004).
- **Eine autoritative Verbindung pro Sitz**: Pro Sitzplatz ist zu jedem Zeitpunkt höchstens eine Verbindung autoritativ; eine neue gültige Verbindung mit demselben Token ersetzt eine vorherige.
- **Statistik-Semantik wie reguläres Partie-Ende**: Die Aufgabe-Wertung schreibt die Statistik nach denselben Regeln und derselben Idempotenz wie ein reguläres Partie-Ende fort (eingeloggt zählt, Gäste nicht).
- **Kein Quick-Play, kein neues visuelles Design**: Bestehende Online-Screens werden um die Trennungs-/Countdown-Anzeige und den Reconnect-Fluss ergänzt; es wird kein neues Design-System eingeführt.
- **Persistenz des aktiven Zustands**: Der aktive Spielzustand bleibt für mindestens die Dauer einer laufenden Partie inklusive Reconnect-Fenster verfügbar; ein darüber hinausgehender Verlust ist ein behandelter Ausnahmefall (Edge Case), kein Normalfall.
