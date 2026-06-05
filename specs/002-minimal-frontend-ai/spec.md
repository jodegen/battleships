# Feature Specification: Minimal spielbares Frontend gegen die KI

**Feature Branch**: `002-minimal-frontend-ai`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "Minimal spielbares Frontend gegen die KI. Nutzt die bestehende Engine als Quelle der Spiellogik. Ziel: Schiffe platzieren (inkl. Touch: ziehen, drehen), gegen eine wählbare KI-Stufe spielen, Spielende erkennen. Bewusst schlicht/ungestylt — das richtige Design kommt später. Kein Backend, kein Login."

## Clarifications

### Session 2026-06-05

- Q: Welcher UI-Ansatz/Stack soll verwendet werden? → A: Next.js + React + TypeScript (der im Gesamtprojekt vorgesehene Stack), hier rein clientseitig/offline genutzt — kein Backend, kein serverseitiger Spielzustand; die Engine bleibt Single Source of Truth.
- Q: Wie werden KI-Züge bei Extrazug-Serien dargestellt? → A: Kurze, sichtbare Verzögerung (~300–500 ms) zwischen aufeinanderfolgenden KI-Schüssen, damit Trefferserien nachvollziehbar sind.
- Q: Wie funktioniert die Platzierung per Zeiger/Touch (Ziehen & Drehen)? → A: Schiff per Drag verschieben; Drehen durch Antippen des Schiffs bzw. einen Dreh-Button (toggelt horizontal/vertikal), touch- und mausfreundlich.

## User Scenarios & Testing *(mandatory)*

Ein bewusst schlichtes, ungestyltes, vollständig clientseitiges Frontend, mit dem eine Person
eine komplette Partie „Schiffe versenken" gegen die KI spielen kann: eigene Flotte platzieren,
Schwierigkeitsgrad wählen, abwechselnd schießen, Sieg/Niederlage erkennen, neu starten. Die
gesamte Spiellogik (Platzierungsregeln, Schussauswertung, Extrazug, Siegerkennung, KI) stammt
**ausschließlich** aus der bestehenden Engine — das Frontend bildet keine eigenen Regeln nach.

### User Story 1 - Eigene Flotte platzieren (Ziehen & Drehen) (Priority: P1)

Die spielende Person platziert ihre Flotte auf einem Raster, indem sie Schiffe per Zeiger/Touch
zieht und dreht. Ungültige Platzierungen (außerhalb, Überlappung, je nach Regel Berührung)
werden verhindert oder klar als ungültig markiert; eine vollständige, gültige Aufstellung schaltet
den Spielstart frei.

**Why this priority**: Ohne platzierte Flotte kann keine Partie beginnen — die Grundvoraussetzung
und damit das MVP des Frontends.

**Independent Test**: Auf einem frischen Bildschirm lässt sich jedes Schiff ziehen und drehen;
gültige Platzierungen werden übernommen, ungültige abgelehnt/markiert; bei vollständiger gültiger
Flotte ist „Spiel starten" verfügbar — prüfbar ohne den eigentlichen Spielablauf.

**Acceptance Scenarios**:

1. **Given** ein leeres Platzierungsraster mit der vorgegebenen Flotte, **When** die Person ein
   Schiff auf freie, im Raster liegende Felder zieht, **Then** wird das Schiff dort platziert.
2. **Given** ein in Platzierung befindliches Schiff, **When** die Person es dreht, **Then**
   wechselt seine Ausrichtung zwischen horizontal und vertikal, sofern es im Raster bleibt.
3. **Given** ein Schiff würde das Raster verlassen oder ein anderes Schiff überlappen, **When**
   die Person es dort ablegt, **Then** wird die Platzierung verhindert bzw. als ungültig markiert
   und nicht übernommen.
4. **Given** eine optionale „zufällig platzieren"-Aktion, **When** sie ausgelöst wird, **Then**
   erzeugt das Frontend eine vollständige, regelkonforme Aufstellung über die Engine.
5. **Given** alle Schiffe sind gültig platziert, **When** die Aufstellung vollständig ist,
   **Then** ist die Aktion „Spiel starten" verfügbar; andernfalls bleibt sie gesperrt.

---

### User Story 2 - Gegen eine wählbare KI-Stufe spielen (Priority: P1)

Die Person wählt eine Schwierigkeitsstufe (Leicht/Mittel/Schwer) und spielt dann abwechselnd
gegen die KI: sie beschießt das Gegnerfeld, sieht Treffer/Fehlschuss/versenkt, behält bei einem
Treffer den Zug (Extrazug), und die KI führt ihre Züge aus. Gegnerische Schiffe bleiben verdeckt,
bis sie getroffen/versenkt werden.

**Why this priority**: Dies ist die eigentliche Spielschleife — zusammen mit US1 ein
durchspielbares Spiel. Ohne sie liefert das Frontend keinen Spielwert.

**Independent Test**: Mit einer gültigen Aufstellung und gewählter Stufe lässt sich eine Partie
abwechselnd spielen; eigene Schüsse zeigen das korrekte Ergebnis, der Zug folgt der Extrazug-Regel,
die KI antwortet sichtbar, und verdeckte Gegnerpositionen werden nicht angezeigt.

**Acceptance Scenarios**:

1. **Given** der Startbildschirm, **When** die Person eine von drei Stufen wählt, **Then** wird
   diese Stufe für die Partie verwendet.
2. **Given** die Person ist am Zug, **When** sie ein noch nicht beschossenes Gegnerfeld wählt,
   **Then** zeigt das Frontend „daneben", „Treffer" oder „versenkt" gemäß Engine-Ergebnis.
3. **Given** ein Treffer, **When** das Ergebnis angezeigt wird, **Then** bleibt die Person am Zug
   (Extrazug); nach einem Fehlschuss ist die KI an der Reihe.
4. **Given** die KI ist am Zug, **When** sie ihren Zug macht, **Then** wird ihr Schuss auf dem
   eigenen Feld der Person sichtbar (Treffer/Fehlschuss) und der Zug kehrt regelkonform zurück.
5. **Given** ein bereits beschossenes Feld, **When** die Person es erneut wählt, **Then**
   passiert nichts (kein doppelter Zug).
6. **Given** das Gegnerfeld, **When** noch nicht getroffene Gegnerschiffe existieren, **Then**
   sind deren Positionen nicht sichtbar.

---

### User Story 3 - Spielende erkennen & neu starten (Priority: P2)

Sobald alle Schiffe einer Seite versenkt sind, erkennt das Frontend das Spielende, zeigt klar
Sieg oder Niederlage an, beendet die Eingabe und bietet einen Neustart an.

**Why this priority**: Rundet die Partie ab und macht das Spiel wiederholt nutzbar. Baut auf der
Spielschleife (US2) auf.

**Independent Test**: Eine bis zum Ende gespielte Partie zeigt das korrekte Ergebnis (Sieg, wenn
die Person zuletzt versenkt; Niederlage, wenn die KI gewinnt), sperrt weitere Eingaben und erlaubt
per Neustart eine neue Partie ohne Neuladen der Seite.

**Acceptance Scenarios**:

1. **Given** die Person versenkt das letzte Schiff der KI, **When** der Schuss ausgewertet ist,
   **Then** zeigt das Frontend „Gewonnen" und nimmt keine weiteren Schüsse mehr an.
2. **Given** die KI versenkt das letzte Schiff der Person, **When** der KI-Zug ausgewertet ist,
   **Then** zeigt das Frontend „Verloren" und beendet die Eingabe.
3. **Given** ein beendetes Spiel, **When** die Person „Neues Spiel" wählt, **Then** beginnt eine
   frische Partie (Platzierung) ohne Neuladen der Seite.

---

### Edge Cases

- Schiff über den Rasterrand ziehen/drehen → verhindert; das Schiff bleibt an gültiger Position
  bzw. wird nicht übernommen.
- Klick auf das Gegnerfeld, bevor das Spiel gestartet wurde oder während die KI am Zug ist → wird
  ignoriert.
- Erneuter Klick auf ein bereits beschossenes Feld → wird ignoriert (kein Effekt).
- „Spiel starten" bei unvollständiger/ungültiger Aufstellung → nicht möglich (gesperrt).
- Seite neu laden → laufende Partie geht verloren (keine Persistenz); ein Neustart beginnt sauber.
- Die KI hat (theoretisch) keinen gültigen Zug mehr → das Frontend bricht die Partie nicht ab,
  sondern behandelt dies als Spielende-/Sonderfall ohne ungültige Aktion.

## Requirements *(mandatory)*

### Functional Requirements

**Nutzung der Engine als Single Source of Truth**

- **FR-001**: Das Frontend MUSS die bestehende Spiel-Engine für **alle** spiellogischen
  Entscheidungen nutzen: Platzierungsvalidierung, Aufstellungserzeugung, Schussauswertung,
  Zugrecht/Extrazug, Siegerkennung und KI-Züge. Es DARF keine Spielregeln eigenständig
  nachbilden.
- **FR-002**: Das Frontend MUSS verdeckte Informationen so behandeln, dass nicht getroffene
  gegnerische Schiffspositionen niemals angezeigt werden (es nutzt die von der Engine
  bereitgestellte, je Seite sichtbare Sicht).

**Platzierung (US1)**

- **FR-003**: Das Frontend MUSS ein Platzierungsraster in der von der Engine vorgegebenen
  Feldgröße samt der vorgegebenen Flotte darstellen.
- **FR-004**: Die Person MUSS jedes Schiff per Zeiger/Touch ziehen (verschieben) können.
- **FR-005**: Die Person MUSS ein Schiff drehen können (Wechsel zwischen horizontaler und
  vertikaler Ausrichtung) — durch Antippen des Schiffs bzw. über einen Dreh-Button; das
  Verschieben erfolgt per Drag. Beide Interaktionen funktionieren mit Maus und Touch.
- **FR-006**: Das Frontend MUSS jede beabsichtigte Platzierung gegen die Engine prüfen und nur
  gültige Platzierungen übernehmen; ungültige werden verhindert oder klar als ungültig markiert.
- **FR-007**: Das Frontend SOLLTE eine „zufällig platzieren"-Aktion bieten, die über die Engine
  eine vollständige, regelkonforme Aufstellung erzeugt.
- **FR-008**: Das Frontend MUSS „Spiel starten" erst dann freigeben, wenn die Aufstellung gemäß
  Engine vollständig und gültig ist.

**Spielablauf gegen die KI (US2)**

- **FR-009**: Das Frontend MUSS vor Spielbeginn die Auswahl einer von drei KI-Stufen
  (Leicht/Mittel/Schwer) ermöglichen.
- **FR-010**: Das Frontend MUSS der Person erlauben, auf dem Gegnerfeld ein noch nicht
  beschossenes Feld zu wählen, und das Ergebnis (daneben/Treffer/versenkt) gemäß Engine anzeigen.
- **FR-011**: Das Frontend MUSS das Zugrecht gemäß Engine abbilden: bei Treffer bleibt die Person
  am Zug (Extrazug), nach Fehlschuss ist die KI an der Reihe.
- **FR-012**: Das Frontend MUSS die KI-Züge über die Engine ausführen und ihre Schüsse auf dem
  Feld der Person sichtbar machen (Treffer/Fehlschuss/versenkt).
- **FR-020**: Bei aufeinanderfolgenden KI-Schüssen (Extrazug-Serie) MUSS das Frontend eine kurze,
  sichtbare Verzögerung (~300–500 ms) zwischen den einzelnen Schüssen einlegen, sodass die Serie
  nachvollziehbar ist (statt sprunghaft zum Endergebnis).
- **FR-013**: Das Frontend MUSS Klicks auf bereits beschossene Felder sowie Eingaben, wenn die
  Person nicht am Zug ist oder das Spiel nicht läuft, wirkungslos behandeln.
- **FR-014**: Das Frontend MUSS jederzeit erkennbar machen, wer am Zug ist.

**Spielende & Neustart (US3)**

- **FR-015**: Das Frontend MUSS das Spielende anhand der Engine erkennen und klar Sieg oder
  Niederlage anzeigen.
- **FR-016**: Nach Spielende MUSS das Frontend weitere Spielzüge unterbinden.
- **FR-017**: Das Frontend MUSS einen Neustart einer Partie ermöglichen, ohne dass die Seite neu
  geladen werden muss.

**Betriebsrahmen**

- **FR-018**: Das Frontend MUSS vollständig clientseitig funktionieren — ohne Backend, ohne
  Login, ohne Netzwerkanfragen für den Spielablauf.
- **FR-019**: Das Frontend ist bewusst schlicht/ungestylt; visuelle Gestaltung, Sounds und
  Animationen sind ausdrücklich **nicht** Teil dieses Features.

### Key Entities *(include if data involved)*

- **Spielsitzung (UI-Zustand)**: Hält die aktuelle Phase (Platzieren / Spielen / Beendet), den
  von der Engine geführten Spielzustand, die gewählte KI-Stufe und wer am Zug ist.
- **Platzierungs-Entwurf**: Die noch nicht bestätigte Anordnung der eigenen Schiffe während der
  Platzierungsphase (Positionen, Ausrichtungen), die gegen die Engine validiert wird.
- **Schwierigkeitsauswahl**: Die gewählte KI-Stufe (Leicht/Mittel/Schwer), die der Engine-KI
  zugeordnet wird.
- **Feld-Darstellung**: Die für die Person sichtbare Sicht je Board (eigene Schiffe + erlittene
  Schüsse; beim Gegner nur die Ergebnisse eigener Schüsse) — abgeleitet aus der Engine-Sicht.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Von einem frischen Start kann eine Person eine Stufe wählen, eine vollständige
  Flotte platzieren (oder automatisch platzieren lassen) und ein Spiel starten — in unter 2
  Minuten.
- **SC-002**: 100 % der regelwidrigen Platzierungsversuche (außerhalb, Überlappung, je nach Regel
  Berührung, unvollständige Flotte) werden verhindert oder abgelehnt.
- **SC-003**: In 100 % der Partien stimmt das angezeigte Ergebnis (Sieg/Niederlage) mit dem von
  der Engine ermittelten Sieger überein.
- **SC-004**: In 100 % der Partien wird keine nicht getroffene gegnerische Schiffszelle sichtbar,
  bevor sie getroffen wurde.
- **SC-005**: Alle drei KI-Stufen sind auswählbar und jeweils bis zum Spielende spielbar.
- **SC-006**: Eine vollständige Partie läuft ohne jegliche Netzwerkanfrage ab (vollständig
  offline/clientseitig).
- **SC-007**: Nach Spielende kann ohne Neuladen der Seite eine neue Partie begonnen werden.

## Assumptions

- Das Frontend nutzt die Engine-Standardkonfiguration: 10×10-Feld, klassische Flotte, Berührung
  erlaubt, Extrazug bei Treffer aktiv. Diese Regeln sind in der minimalen Version nicht im UI
  umschaltbar (Konfigurierbarkeit später).
- „Touch" im Auftrag bezeichnet die **Zeiger-/Touch-Interaktion** (Ziehen + Drehen) und
  funktioniert sowohl mit Maus als auch mit Touch; es ist nicht die Berührungsregel der Schiffe.
- Die spielende Person ist die startende Seite; die KI ist die Gegenseite (entspricht der
  Engine-Startregel).
- Die gegnerische KI-Flotte wird beim Spielstart automatisch regelkonform platziert (über den
  Engine-Generator aus dem Sitzungs-Seed); die Person platziert ausschließlich die eigene Flotte.
- Einzelspieler gegen KI; kein Mehrspieler, kein Netzwerk, kein Login, keine Persistenz — ein
  Neuladen der Seite setzt die Partie zurück.
- Bewusst ungestylt: kein responsives Layout, keine Sounds/Animationen, keine Internationalisierung
  in dieser Version (spätere Meilensteine).
- Umgesetzt mit Next.js + React + TypeScript, jedoch rein clientseitig (kein serverseitiger
  Spielzustand, keine API-Routen für die Spiellogik); dies legt nur den UI-Stack fest und ändert
  nichts am Offline-/No-Backend-Charakter (FR-018).
- Das Frontend wählt zu Spielbeginn einen Zufalls-Seed für die Engine-KI/Generierung; die Engine
  bleibt bei gegebenem Seed deterministisch.
- Reaktionszeiten sind nicht kritisch; die KI-Zugauswahl liegt im interaktiven Bereich (gemäß
  Engine-Performance).
