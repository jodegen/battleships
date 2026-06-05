# Feature Specification: Identität und Persistenz

**Feature Branch**: `003-identity-persistence`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "Identität und Persistenz. Eingeloggte Nutzer (E-Mail + Passwort) mit Profil und Session; Gäste mit temporärem Anzeigenamen ohne Account (nur Session). Statistik-Tracking für eingeloggte Nutzer: gamesPlayed, wins, losses, winRate — nach einer beendeten KI-Partie wird das Ergebnis gespeichert und im Profil angezeigt. Das Identitätsmodell muss klar zwischen \"eingeloggt\" und \"Gast\" unterscheiden, weil später nur eingeloggte Spieler Lobbys erstellen dürfen. Noch kein PvP, kein Echtzeit, kein Stack-Detail."

## Clarifications

### Session 2026-06-05

- Q: Wie werden beendete KI-Partien gespeichert, und worüber wird die Idempotenz (FR-019) verankert? → A: Nur die aggregierte Statistik wird fortgeschrieben; jede beendete Partie trägt eine eindeutige Ergebnis-Kennung als serverseitiger Dedup-Schlüssel. Volle Match-Datensätze/History/Replays bleiben einem späteren Meilenstein vorbehalten.
- Q: Welche Mindestanforderung gilt für Konto-Passwörter? → A: Mindestens 8 Zeichen, keine erzwungene Zeichenklassen-Komposition (lange Passphrasen erlaubt; NIST-800-63B-orientiert).
- Q: Werden Registrierung/Anmeldung schon in diesem Feature gegen Brute-Force geschützt? → A: Nein — Auth-Missbrauchsschutz (Rate-Limiting/Lockout) wird ausdrücklich auf den späteren Anti-Abuse-Meilenstein verschoben.
- Q: Wie lange bleibt eine Anmeldung bestehen? → A: Dauerhafte Sitzung, die Neuladen und Browser-Neustart übersteht, mit rollierendem Ablauf bei Inaktivität (~30 Tage); ausdrückliches Abmelden beendet sie.

## User Scenarios & Testing *(mandatory)*

Dieses Feature führt **Identität** und **dauerhafte Persistenz** ein (Meilenstein 2 der
Roadmap, Abschnitte 3 und 9 der Projektspezifikation). Es gibt fortan zwei klar getrennte
Nutzertypen: **eingeloggte Spieler** (Konto aus E-Mail + Passwort, mit Profil, dauerhaften
Statistiken und einer Sitzung) und **Gäste** (nur ein temporärer Anzeigename, keine
Registrierung, kein dauerhafter Zustand). Nach jeder beendeten Partie gegen die KI wird das
Ergebnis für eingeloggte Spieler in ihre Statistik geschrieben und im Profil sichtbar. Die
Unterscheidung „eingeloggt vs. Gast" ist bewusst scharf, weil künftige Fähigkeiten (z. B. das
Erstellen von Lobbys) nur eingeloggten Spielern offenstehen. PvP, Echtzeit und konkrete
technische Umsetzung sind nicht Teil dieses Features.

### User Story 1 - Registrieren, anmelden, Profil haben (Priority: P1)

Eine Person erstellt mit E-Mail und Passwort ein Konto, meldet sich an und erhält ein Profil
mit ihrem Anzeigenamen. Die Anmeldung bleibt über eine Sitzung bestehen, sodass sie nach dem
Neuladen weiterhin als dieselbe Person erkannt wird, bis sie sich abmeldet. Eine bereits
registrierte Person kann sich erneut anmelden und findet ihr Profil und ihre Daten wieder vor.

**Why this priority**: Ohne Konto, Anmeldung und Sitzung gibt es keine dauerhafte Identität,
an die Statistiken gebunden werden könnten — dies ist das Fundament des gesamten Features und
das MVP von Meilenstein 2.

**Independent Test**: Eine neue Person kann sich registrieren, abmelden und mit denselben
Zugangsdaten wieder anmelden; nach erneutem Laden bleibt sie angemeldet und sieht dasselbe
Profil — vollständig prüfbar ohne dass eine einzige Partie gespielt wurde.

**Acceptance Scenarios**:

1. **Given** eine Person ohne Konto, **When** sie sich mit gültiger, noch nicht verwendeter
   E-Mail, einem Passwort und einem Anzeigenamen registriert, **Then** wird ein Konto angelegt
   und sie ist angemeldet.
2. **Given** eine bereits registrierte E-Mail, **When** jemand versucht, sich erneut mit
   derselben E-Mail zu registrieren, **Then** wird die Registrierung abgelehnt und der Grund
   verständlich mitgeteilt.
3. **Given** ein bestehendes Konto, **When** die Person sich mit korrekter E-Mail und korrektem
   Passwort anmeldet, **Then** ist sie angemeldet und sieht ihr Profil mit Anzeigenamen.
4. **Given** ein bestehendes Konto, **When** die Person sich mit falschem Passwort anmeldet,
   **Then** wird die Anmeldung abgelehnt, ohne preiszugeben, ob die E-Mail existiert.
5. **Given** eine angemeldete Person, **When** sie die Anwendung neu lädt, **Then** ist sie
   weiterhin angemeldet, bis ihre Sitzung endet oder sie sich abmeldet.
6. **Given** eine angemeldete Person, **When** sie sich abmeldet, **Then** wird ihre Sitzung
   beendet und sie gilt nicht mehr als angemeldet.

---

### User Story 2 - Statistiken aus KI-Partien sehen (Priority: P1)

Eine angemeldete Person spielt eine Partie gegen die KI zu Ende. Sobald die Partie ein Ergebnis
hat (gewonnen oder verloren), wird dies dauerhaft ihrer Statistik hinzugefügt: gespielte Partien,
Siege, Niederlagen und die daraus berechnete Siegquote. Im Profil sieht die Person ihre
aktuellen Werte; sie wachsen über mehrere Partien und Sitzungen hinweg.

**Why this priority**: Die dauerhafte Erfassung von KI-Ergebnissen ist der namensgebende
Mehrwert von „Persistenz" in diesem Meilenstein. Zusammen mit US1 liefert sie ein vollständiges,
für Nutzer sichtbares Ergebnis.

**Independent Test**: Eine angemeldete Person mit bekannten Ausgangswerten spielt eine KI-Partie
zu Ende; danach ist genau eine gespielte Partie mehr verzeichnet, Sieg oder Niederlage ist je
nach Ausgang um eins erhöht, die Siegquote ist konsistent neu berechnet, und die Werte bleiben
nach erneuter Anmeldung erhalten.

**Acceptance Scenarios**:

1. **Given** eine angemeldete Person, **When** sie eine KI-Partie als Sieger beendet, **Then**
   erhöhen sich gespielte Partien um eins und Siege um eins, und die Siegquote wird neu berechnet.
2. **Given** eine angemeldete Person, **When** sie eine KI-Partie als Verlierer beendet, **Then**
   erhöhen sich gespielte Partien um eins und Niederlagen um eins, und die Siegquote wird neu
   berechnet.
3. **Given** eine angemeldete Person mit aufgezeichneten Partien, **When** sie ihr Profil
   öffnet, **Then** sieht sie gespielte Partien, Siege, Niederlagen und Siegquote.
4. **Given** eine angemeldete Person, **When** sie sich abmeldet und später erneut anmeldet,
   **Then** sind ihre zuvor erfassten Statistiken unverändert vorhanden.
5. **Given** eine Person ohne gespielte Partien, **When** sie ihr Profil öffnet, **Then** werden
   gespielte Partien, Siege und Niederlagen als null und die Siegquote in einer wohldefinierten
   Form (z. B. 0 %) angezeigt.
6. **Given** eine beendete KI-Partie, **When** das Ergebnis bereits einmal erfasst wurde,
   **Then** führt dieselbe beendete Partie nicht zu einer doppelten Zählung.

---

### User Story 3 - Als Gast spielen ohne Konto (Priority: P2)

Eine Person möchte ohne Registrierung sofort spielen. Sie wählt einen temporären Anzeigenamen
und spielt als Gast gegen die KI. Ihr Zustand existiert nur für die Dauer der Sitzung; es wird
kein Konto angelegt und keine Statistik gespeichert. Beendet sie die Sitzung, ist die
Gast-Identität verschwunden.

**Why this priority**: Niedrige Einstiegshürde ist ein Kernziel des Projekts; Gäste müssen
spielen können, ohne dass dafür Persistenz nötig ist. Baut auf der Identitäts-Unterscheidung
auf, ist aber für das Speichern von Statistiken nicht erforderlich.

**Independent Test**: Eine Person kann ohne Registrierung mit einem gewählten Anzeigenamen als
Gast eine KI-Partie spielen; danach existiert kein Konto und keine gespeicherte Statistik, und
nach Sitzungsende ist die Gast-Identität nicht wiederherstellbar.

**Acceptance Scenarios**:

1. **Given** eine Person ohne Konto, **When** sie einen gültigen temporären Anzeigenamen wählt
   und als Gast fortfährt, **Then** erhält sie eine Gast-Sitzung und kann gegen die KI spielen.
2. **Given** ein als Gast eingegebener Anzeigename, **When** er die Namensregeln verletzt
   (z. B. Länge oder unzulässiger Inhalt), **Then** wird er abgelehnt und ein zulässiger Name
   verlangt.
3. **Given** ein Gast, **When** er eine KI-Partie beendet, **Then** wird kein dauerhaftes
   Konto und keine Statistik gespeichert.
4. **Given** ein Gast, **When** die Sitzung endet, **Then** ist die Gast-Identität samt
   Anzeigename nicht wiederherstellbar.

---

### User Story 4 - Klare Trennung von eingeloggt und Gast (Priority: P2)

Das System unterscheidet jederzeit eindeutig, ob die aktuelle Identität ein eingeloggter Spieler
oder ein Gast ist. Diese Unterscheidung ist die Grundlage dafür, künftige Fähigkeiten gezielt
nur eingeloggten Spielern zu erlauben (z. B. das spätere Erstellen von Lobbys). In diesem Feature
äußert sich das darin, dass eingeloggte Spieler Profil und Statistik besitzen, Gäste nicht, und
dass auf eingeloggte Fähigkeiten beschränkte Aktionen für Gäste klar nicht verfügbar sind.

**Why this priority**: Eine saubere, früh etablierte Identitäts-Unterscheidung verhindert
späteren Umbau und ist die ausdrücklich genannte Voraussetzung für die spätere
Lobby-Berechtigung. Sie ist wertvoll, aber ohne US1 nicht eigenständig nutzbar.

**Independent Test**: Für eine angemeldete und für eine Gast-Identität lässt sich eindeutig
abfragen, welcher Typ vorliegt; nur eingeloggte besitzen Profil/Statistik, und eine als
„nur eingeloggt" markierte Beispielfähigkeit ist für Gäste nachweisbar gesperrt.

**Acceptance Scenarios**:

1. **Given** eine aktive Identität, **When** das System ihren Typ ermittelt, **Then** ist
   eindeutig erkennbar, ob es sich um einen eingeloggten Spieler oder einen Gast handelt.
2. **Given** ein Gast, **When** eine auf eingeloggte Spieler beschränkte Fähigkeit angefragt
   wird, **Then** ist sie nicht verfügbar und der Grund ist verständlich.
3. **Given** ein eingeloggter Spieler, **When** dieselbe Fähigkeit angefragt wird, **Then** ist
   sie verfügbar.
4. **Given** ein Gast und ein eingeloggter Spieler, **When** beide ein Profil aufrufen wollen,
   **Then** besitzt nur der eingeloggte Spieler Profil und Statistik.

---

### Edge Cases

- **Doppelte Ergebniserfassung**: Wird dasselbe Partie-Ende mehrfach gemeldet (z. B. durch
  erneutes Laden oder wiederholtes Senden), darf es die Statistik nur einmal verändern.
- **Ergebnis ohne Anmeldung**: Beendet ein Gast eine KI-Partie, wird kein Ergebnis gespeichert;
  es entsteht kein „verwaister" Statistikeintrag.
- **Unentschieden**: In „Schiffe versenken" gibt es kein Unentschieden — jede beendete Partie
  hat genau einen Sieger; gespielte Partien entsprechen stets der Summe aus Siegen und
  Niederlagen.
- **Abgebrochene/unbeendete Partie**: Eine Partie ohne Ergebnis (Abbruch, Verlassen) zählt
  nicht in die Statistik.
- **Siegquote ohne Partien**: Vor der ersten Partie ist die Siegquote wohldefiniert (keine
  Division durch null) und wird als 0 % dargestellt.
- **E-Mail bereits vergeben**: Registrierung mit einer schon verwendeten E-Mail wird abgelehnt.
- **Anzeigename-Kollision**: Mehrere Gäste oder Spieler dürfen denselben Anzeigenamen tragen;
  Eindeutigkeit wird nur für die E-Mail eines Kontos verlangt.
- **Falsche Zugangsdaten**: Fehlgeschlagene Anmeldung gibt nicht preis, ob die E-Mail existiert
  oder das Passwort falsch war.
- **Sitzungsende**: Läuft eine Sitzung ab oder wird beendet, gilt die Person als nicht
  angemeldet; eine Gast-Sitzung lässt sich danach nicht wiederherstellen.

## Requirements *(mandatory)*

### Functional Requirements

**Identität & Nutzertypen**

- **FR-001**: Das System MUSS zwei Identitätstypen unterstützen und jederzeit eindeutig
  unterscheiden: **eingeloggter Spieler** (mit Konto) und **Gast** (ohne Konto).
- **FR-002**: Das System MUSS für jede aktive Identität ihren Typ (eingeloggt/Gast) eindeutig
  bestimmbar machen, damit Fähigkeiten typabhängig freigegeben oder gesperrt werden können.
- **FR-003**: Das System MUSS Fähigkeiten, die als „nur für eingeloggte Spieler" markiert sind,
  für Gäste sperren und für eingeloggte Spieler erlauben. (In diesem Feature dient die spätere
  Lobby-Erstellung als der bekannte Anwendungsfall; sie wird hier nicht implementiert.)

**Konten, Anmeldung & Sitzung**

- **FR-004**: Eine Person MUSS ein Konto mit E-Mail, Passwort und Anzeigenamen erstellen können.
- **FR-005**: Das System MUSS die E-Mail eines Kontos als eindeutig erzwingen und eine
  Registrierung mit bereits vergebener E-Mail mit verständlichem Grund ablehnen.
- **FR-006**: Das System MUSS Passwörter ausschließlich in nicht zurückrechenbarer Form
  (gehasht, gesalzen) speichern und niemals im Klartext ablegen oder ausgeben.
- **FR-023**: Das System MUSS bei der Registrierung Passwörter mit weniger als 8 Zeichen
  ablehnen. Es DARF KEINE Zeichenklassen-Komposition (Pflichtmischung aus Buchstaben/Ziffern/
  Sonderzeichen) erzwingen; lange Passphrasen sind zulässig.
- **FR-007**: Eine registrierte Person MUSS sich mit E-Mail und Passwort anmelden können.
- **FR-008**: Das System MUSS fehlgeschlagene Anmeldungen ablehnen, ohne offenzulegen, ob die
  E-Mail existiert oder das Passwort falsch war.
- **FR-009**: Das System MUSS eine angemeldete Identität über eine **dauerhafte** Sitzung
  aufrechterhalten, die sowohl erneutes Laden als auch einen Browser-Neustart übersteht. Die
  Sitzung läuft bei Inaktivität rollierend ab (Richtwert ~30 Tage) und wird durch jede Aktivität
  verlängert; ausdrückliches Abmelden beendet sie sofort.
- **FR-010**: Eine angemeldete Person MUSS sich abmelden können, wodurch ihre Sitzung beendet
  wird.
- **FR-011**: Das System MUSS einem eingeloggten Spieler ein Profil bereitstellen, das mindestens
  seinen Anzeigenamen und seine Statistik zeigt.

**Gäste**

- **FR-012**: Eine Person MUSS ohne Registrierung als Gast fortfahren können, indem sie einen
  temporären Anzeigenamen wählt.
- **FR-013**: Das System MUSS Gast-Anzeigenamen gegen Namensregeln validieren (mindestens
  Längengrenzen und ein Filter unzulässiger Inhalte) und unzulässige Namen ablehnen.
- **FR-014**: Das System DARF für Gäste KEIN dauerhaftes Konto und KEINE dauerhafte Statistik
  anlegen; die Gast-Identität existiert nur für die Dauer der Sitzung.
- **FR-015**: Das System MUSS sicherstellen, dass eine beendete Gast-Sitzung samt Anzeigename
  nicht wiederherstellbar ist.

**Statistik-Erfassung & -Anzeige**

- **FR-016**: Das System MUSS für jeden eingeloggten Spieler eine dauerhafte Statistik führen
  mit: gespielte Partien (`gamesPlayed`), Siege (`wins`), Niederlagen (`losses`) und Siegquote
  (`winRate`). „Führen" bedeutet nicht zwingend „speichern": `wins`/`losses` sind die
  gespeicherte Quelle der Wahrheit; `gamesPlayed` und `winRate` DÜRFEN daraus abgeleitet statt
  redundant gespeichert werden (siehe FR-018).
- **FR-017**: Das System MUSS nach einer **beendeten** KI-Partie eines eingeloggten Spielers das
  Ergebnis erfassen: gespielte Partien +1 sowie je nach Ausgang Siege +1 oder Niederlagen +1.
- **FR-018**: Das System MUSS die Siegquote konsistent aus Siegen und gespielten Partien
  ableiten und für den Fall „keine Partien" wohldefiniert behandeln (keine Division durch null).
- **FR-019**: Das System MUSS verhindern, dass dasselbe beendete Partie-Ergebnis mehrfach
  gezählt wird (Idempotenz der Ergebniserfassung). Jede beendete Partie trägt dazu eine
  eindeutige Ergebnis-Kennung, die serverseitig als Dedup-Schlüssel dient; eine Meldung mit
  bereits verarbeiteter Kennung verändert die Statistik nicht erneut.
- **FR-025**: Das System fortschreibt ausschließlich die aggregierte Statistik je Spieler; es
  speichert in diesem Feature KEINE vollständigen Match-Datensätze. Match-History und Replays
  (eigene `Match`/`MatchMove`-Datensätze gemäß Projektspezifikation §9) bleiben einem späteren
  Meilenstein vorbehalten.
- **FR-020**: Das System DARF für unbeendete oder abgebrochene Partien KEIN Ergebnis in die
  Statistik schreiben. Durchsetzung: Ergebnisse werden ausschließlich bei Partie-Status
  „finished" gemeldet, und die Erfassungs-Schnittstelle kennt nur die Ausgänge `win`/`loss`
  (kein „in-progress"); eine unbeendete Partie erzeugt damit per Konstruktion keine Meldung.
- **FR-021**: Das System MUSS die aktuellen Statistikwerte im Profil des eingeloggten Spielers
  anzeigen und sie über Sitzungen hinweg unverändert erhalten.

**Abgrenzung**

- **FR-022**: Das System DARF in diesem Feature KEIN PvP, KEINE Echtzeitfunktionen und KEINE
  Lobby-Erstellung umfassen; lediglich die Identitäts-Unterscheidung als deren spätere Grundlage.
- **FR-024**: Auth-Missbrauchsschutz (Rate-Limiting bzw. Konto-Lockout bei wiederholten
  Fehlversuchen an Registrierung/Anmeldung) ist in diesem Feature NICHT enthalten und wird auf
  den späteren Anti-Abuse-Meilenstein verschoben. (FR-008 — keine Preisgabe, ob E-Mail/Passwort
  fehlerhaft — gilt unabhängig davon weiter.)

### Key Entities *(include if feature involves data)*

- **Eingeloggter Spieler (Konto)**: Eine dauerhaft gespeicherte Identität. Attribute:
  eindeutige Kennung, Anzeigename, eindeutige E-Mail, nicht zurückrechenbares Passwort-Geheimnis,
  Erstellungszeitpunkt. Besitzt genau eine Statistik und kann eine aktive Sitzung haben.
- **Gast**: Eine flüchtige Identität, die nur an eine Sitzung gebunden ist. Attribut: temporärer
  Anzeigename. Kein dauerhafter Datensatz, keine Statistik.
- **Statistik**: Genau einem eingeloggten Spieler zugeordnet. Attribute: gespielte Partien,
  Siege, Niederlagen, Siegquote (aus Siegen/gespielten Partien abgeleitet). Wächst je beendeter
  KI-Partie.
- **Sitzung**: Repräsentiert die aktuell aktive Identität (eingeloggt oder Gast) und ihren
  Anmeldezustand über Neuladevorgänge hinweg, bis sie endet.
- **Ergebnis einer KI-Partie**: Das beim Beenden einer Partie gemeldete Resultat (Ausgang
  gewonnen/verloren samt Bezug auf den Spieler), das genau einmal in die Statistik einfließt.
  Trägt eine **eindeutige Ergebnis-Kennung**, die als serverseitiger Dedup-Schlüssel die
  Idempotenz sichert (FR-019). Es wird kein vollständiger Match-Datensatz gespeichert (FR-025).
  Anmerkung: Die Engine kennzeichnet eine beendete Partie über ihren Status „finished" und einen
  eindeutigen Sieger; ob daraus für die aktuelle Person ein Sieg oder eine Niederlage wird,
  ergibt sich aus ihrer Seite in der Partie.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Eine neue Person kann von „kein Konto" bis „angemeldet mit sichtbarem Profil" in
  weniger als 2 Minuten und in einem einzigen durchgehenden Ablauf gelangen.
- **SC-002**: Nach jeder beendeten KI-Partie eines eingeloggten Spielers ist die Statistik in
  100 % der Fälle korrekt um genau eine gespielte Partie und genau einen Sieg **oder** eine
  Niederlage erhöht.
- **SC-003**: Die angezeigte Siegquote stimmt in 100 % der Fälle mit Siege/gespielte Partien
  überein und ist auch bei null gespielten Partien wohldefiniert.
- **SC-004**: Statistiken eines eingeloggten Spielers bleiben über Abmeldung, erneute Anmeldung
  und Neuladen zu 100 % erhalten.
- **SC-005**: Für 100 % der Gast-Sitzungen entsteht kein dauerhaftes Konto und keine gespeicherte
  Statistik, und die Gast-Identität ist nach Sitzungsende nicht wiederherstellbar.
- **SC-006**: Das wiederholte Melden desselben Partie-Endes verändert die Statistik in 0 % der
  Fälle ein zweites Mal (keine Doppelzählung).
- **SC-007**: Für jede aktive Identität lässt sich in 100 % der Fälle eindeutig bestimmen, ob es
  sich um einen eingeloggten Spieler oder einen Gast handelt; eine als „nur eingeloggt" markierte
  Beispielfähigkeit ist für Gäste in 100 % der Fälle gesperrt und für eingeloggte Spieler
  verfügbar.
- **SC-008**: Passwörter sind in 0 % der Fälle aus gespeicherten Daten oder Ausgaben im Klartext
  ablesbar.
- **SC-009**: Registrierungsversuche mit einem Passwort von weniger als 8 Zeichen werden in
  100 % der Fälle abgelehnt; ein reines 8+-Zeichen-Passwort ohne Sonderzeichen wird in 100 % der
  Fälle akzeptiert.
- **SC-010**: Eine angemeldete Person bleibt nach Schließen und erneutem Öffnen des Browsers
  (innerhalb des Inaktivitätsfensters) in 100 % der Fälle angemeldet, ohne sich erneut anmelden
  zu müssen.

## Assumptions

- **Einklang mit der Projektspezifikation**: Datenmodell und Nutzertypen folgen den Abschnitten
  3 und 9 der Projektspezifikation (User, Stat mit `gamesPlayed/wins/losses/winRate`; Gäste ohne
  `User`-Eintrag). Weitere dort skizzierte Statistikfelder (`eloRating`, `totalShotsFired`,
  `hitRate`) sind hier **nicht** Teil des Umfangs und können später ergänzt werden.
- **Nur E-Mail + Passwort**: OAuth (Google/GitHub) aus Abschnitt 3.3 ist in diesem Feature
  ausdrücklich **nicht** enthalten und für später vorgesehen.
- **Engine als Quelle des Spielausgangs**: Der Spielausgang (beendet + Sieger) stammt aus der
  bestehenden Engine (`status: 'finished'`, `winner`); dieses Feature interpretiert ihn nur und
  bildet keine eigene Siegregel nach.
- **KI-Partien only**: Erfasst werden ausschließlich Ergebnisse von Partien gegen die KI; PvP
  existiert in diesem Meilenstein noch nicht.
- **Aggregierte Statistik**: Es wird nur eine Gesamtstatistik geführt; eine Aufschlüsselung nach
  KI-Schwierigkeitsgrad ist nicht Teil dieses Features.
- **Keine Gast-zu-Konto-Migration**: Da Gäste keine Statistik besitzen, gibt es nichts zu
  migrieren, wenn aus einem Gast später ein registrierter Spieler wird.
- **Keine E-Mail-Verifikation/Passwort-Reset in v1 dieses Features**: Verifizierungs- und
  Reset-Flüsse werden als spätere Erweiterung betrachtet und sind hier nicht Pflicht.
- **Passwortregeln**: Mindestens 8 Zeichen, keine erzwungene Zeichenklassen-Komposition
  (siehe FR-023, geklärt 2026-06-05).
- **Namensregeln**: Anzeigenamen 3–20 Zeichen; Inhaltsfilter über ein **projekteigenes,
  minimales Blocklist-Pattern** für v1 (eine externe Schimpfwort-Bibliothek bleibt optionale
  spätere Erweiterung — beantwortet die offene Frage aus §12 der Projektspezifikation für diesen
  Meilenstein) (FR-013). Tests prüfen den Filter-**Mechanismus**, nicht eine bestimmte Wortliste.
- **Sitzungsdauer**: Eingeloggte Sitzung dauerhaft über Neuladen und Browser-Neustart hinweg,
  rollierender Ablauf bei Inaktivität (~30 Tage), Beendigung durch Abmeldung (siehe FR-009,
  geklärt 2026-06-05). Die **Gast-Token-Lebensdauer** ist demgegenüber kurz und nicht
  rollierend — Default ~24 h (kein Persistenzbedarf, FR-014/FR-015).
- **Auth-Missbrauchsschutz verschoben**: Rate-Limiting/Lockout an Registrierung/Anmeldung ist
  nicht Teil dieses Features (FR-024, geklärt 2026-06-05).

## Dependencies

- Setzt die bestehende **`@schiffe/engine`** voraus (Single Source of Truth für Spielregeln und
  den Partie-Ausgang); dieses Feature fügt keine Spielregeln hinzu.
- Knüpft an den durch Feature 002 etablierten Spielablauf gegen die KI an, der das Partie-Ende
  liefert, das hier erfasst wird.
