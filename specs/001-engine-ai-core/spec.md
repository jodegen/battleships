# Feature Specification: Spiel-Engine & KI (Meilenstein 1)

**Feature Branch**: `001-engine-ai-core`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "Baue als erstes Feature ausschließlich die Spiel-Engine und die KI (Meilenstein 1): Board, Schiffsplatzierung inkl. konfigurierbarer Berührungsregel, Schussauswertung mit Extrazug-Regel bei Treffer, Siegerkennung, und die drei KI-Stufen (Zufall, Hunt&Target, Wahrscheinlichkeitsdichte). Kein UI, kein Backend, keine Tech-Stack-Details."

## Clarifications

### Session 2026-06-05

- Q: Soll die Engine eine deterministische Zufalls-/Auto-Platzierung der Flotte bereitstellen (regelkonform, inkl. Berührungsregel)? → A: Ja — die Engine liefert einen deterministischen Generator, der eine gültige Aufstellung erzeugt (via injizierten Zufall), damit eine komplette Partie gegen die KI ohne UI/Backend lauffähig ist.
- Q: Sollen die KI-Stufen die aktive Berührungsregel ausnutzen? → A: Nur die schwere KI (Wahrscheinlichkeitsdichte) berücksichtigt sie; bei „Berührung verboten" werden Platzierungen/Felder, die an bekannte/versenkte Schiffe angrenzen, ausgeschlossen. Zufall und Hunt & Target bleiben regel-agnostisch.
- Q: Wie geht die schwere KI nach einem Treffer vor? → A: Reine Wahrscheinlichkeitsdichte (konsistent mit offenen Treffern) — kein separater Hunt&Target-Modus; das Paritätsmuster wirkt nur im Suchmodus.
- Q: Erfährt die KI bei „versenkt", welches Schiff (und dessen Länge) versenkt wurde? → A: Ja — „versenkt" verrät das betroffene Schiff inkl. Länge; die Dichte-KI entfernt dieses Schiff aus der lebenden Flotte.

## User Scenarios & Testing *(mandatory)*

Dieses Feature liefert die reine Spiellogik („Engine") und die KI-Gegner für „Schiffe
versenken". Es gibt keine Benutzeroberfläche und keine Netzwerk-/Server-Komponente; der
Wert wird über eine in sich abgeschlossene, deterministische Spiellogik geliefert, die eine
vollständige Partie gegen die KI lokal abbilden kann. Die „Nutzer" der Engine sind sowohl
die spätere Anwendung (die die Engine einbindet) als auch — über die Engine vermittelt — die
Spielenden, deren Partie diese Regeln steuern.

### User Story 1 - Gültige Flotte auf dem Board platzieren (Priority: P1)

Eine Partie beginnt damit, dass beide Seiten ihre Flotte auf einem Board platzieren. Die
Engine muss ein Board bereitstellen und jede Platzierung gegen die Spielregeln prüfen: Lage
innerhalb des Felds, nur horizontale/vertikale Ausrichtung, korrekte Flottenzusammensetzung,
keine Überlappung und die **konfigurierbare Berührungsregel** (Berühren erlaubt vs. verboten).

**Why this priority**: Ohne ein Board und gültige Platzierungen kann keine Partie existieren.
Dies ist die fundamentale Voraussetzung für jede weitere Engine-Funktion und damit das MVP.

**Independent Test**: Eine Flotte wird auf ein leeres Board gesetzt; gültige Platzierungen
werden akzeptiert, jede Regelverletzung (außerhalb, Überlappung, falsche Anzahl/Größe,
unzulässige Berührung bei aktivierter Regel) wird mit klarem Grund abgelehnt — vollständig
prüfbar ohne weitere Engine-Teile.

**Acceptance Scenarios**:

1. **Given** ein leeres 10×10-Board und die klassische Flotte, **When** alle Schiffe innerhalb
   des Felds, ohne Überlappung und in zulässiger Ausrichtung platziert werden, **Then** gilt
   die Aufstellung als vollständig und gültig.
2. **Given** ein Schiff soll teilweise außerhalb des Felds liegen, **When** die Platzierung
   geprüft wird, **Then** wird sie mit Grund „außerhalb des Spielfelds" abgelehnt.
3. **Given** zwei Schiffe würden sich ein Feld teilen, **When** die Platzierung geprüft wird,
   **Then** wird sie mit Grund „Überlappung" abgelehnt.
4. **Given** eine Lobby-Konfiguration mit Berührung = verboten, **When** zwei Schiffe sich
   orthogonal oder diagonal berühren, **Then** wird die Platzierung mit Grund
   „Mindestabstand verletzt" abgelehnt.
5. **Given** dieselbe Konfiguration mit Berührung = erlaubt, **When** zwei Schiffe direkt
   aneinander liegen, **Then** wird die Platzierung akzeptiert.
6. **Given** eine Aufstellung mit zu vielen, zu wenigen oder falsch dimensionierten Schiffen,
   **When** sie geprüft wird, **Then** wird sie mit Grund „Flotte entspricht nicht der
   Konfiguration" abgelehnt.

---

### User Story 2 - Schüsse auswerten, Extrazug und Sieger erkennen (Priority: P2)

Auf einer gültigen Aufstellung müssen Schüsse ausgewertet werden: Jeder Schuss ergibt
„daneben", „Treffer" oder „versenkt". Bei einem Treffer bleibt dieselbe Seite am Zug
(Extrazug-Regel); erst ein Fehlschuss wechselt den Zug. Sobald alle Schiffe einer Seite
versenkt sind, erkennt die Engine den Sieger.

**Why this priority**: Dies ist die eigentliche Spielschleife. Zusammen mit US1 ergibt sich
eine vollständige, von Anfang bis Ende durchspielbare Partie (mit zwei vorgegebenen
Aufstellungen) — also ein eigenständig demonstrierbarer Mehrwert.

**Independent Test**: Ausgehend von zwei festen Aufstellungen wird eine Schussfolge
abgespielt; die Engine liefert korrekte Ergebnisse je Schuss, hält bei Treffern denselben
Spieler am Zug, wechselt bei Fehlschuss und meldet den Sieger, sobald eine Flotte
vollständig versenkt ist.

**Acceptance Scenarios**:

1. **Given** der aktive Spieler ist am Zug, **When** er auf ein leeres Wasserfeld schießt,
   **Then** ist das Ergebnis „daneben" und der Zug wechselt zur Gegenseite.
2. **Given** der aktive Spieler ist am Zug, **When** er ein Schiffsfeld trifft, das nicht das
   letzte des Schiffs ist, **Then** ist das Ergebnis „Treffer" und derselbe Spieler bleibt am
   Zug (Extrazug).
3. **Given** ein Schiff hat nur noch ein nicht getroffenes Feld, **When** dieses getroffen
   wird, **Then** ist das Ergebnis „versenkt" und derselbe Spieler bleibt am Zug.
4. **Given** ein Feld wurde bereits beschossen, **When** erneut darauf geschossen wird,
   **Then** wird der Schuss als ungültig abgelehnt und verändert den Zustand nicht.
5. **Given** ein Schuss zielt außerhalb des Felds oder die schießende Seite ist nicht am Zug,
   **When** er ausgewertet wird, **Then** wird er als ungültig abgelehnt.
6. **Given** der letzte verbleibende Schiffsteil der Gegenseite, **When** er getroffen wird,
   **Then** meldet die Engine den schießenden Spieler als Sieger und die Partie als beendet.
7. **Given** die Extrazug-Regel ist deaktiviert, **When** ein Treffer erfolgt, **Then**
   wechselt der Zug dennoch zur Gegenseite.

---

### User Story 3 - Gegen KI in drei Schwierigkeitsstufen spielen (Priority: P3)

Die Engine stellt KI-Gegner bereit, die für eine gegebene Spielsituation den nächsten Schuss
wählen — in drei klar unterscheidbaren Stufen: **Zufall** (leicht), **Hunt & Target**
(mittel) und **Wahrscheinlichkeitsdichte mit Paritätsmuster** (schwer).

**Why this priority**: Baut auf der funktionierenden Spielschleife (US2) auf und liefert den
Einzelspieler-Modus aus Meilenstein 1. Wertvoll, aber erst sinnvoll, wenn Platzierung und
Schussauswertung stehen.

**Independent Test**: Für eine gegebene, der KI bekannte Trefferhistorie wählt jede Stufe
einen zulässigen Zug; das stufentypische Verhalten ist beobachtbar und (bei fixiertem
Zufallsstrom) reproduzierbar.

**Acceptance Scenarios**:

1. **Given** eine KI auf Stufe „Zufall" und eine teilweise beschossene Karte, **When** sie
   ihren Zug wählt, **Then** trifft sie ein noch nicht beschossenes, im Feld liegendes Feld
   und setzt nach einem Treffer nicht gezielt nach.
2. **Given** eine KI auf Stufe „Hunt & Target" nach einem unverdeckten Treffer, **When** sie
   ihren nächsten Zug wählt, **Then** wählt sie ein noch unbeschossenes Feld, das orthogonal
   an einen offenen Treffer angrenzt; ohne offene Treffer sucht sie wie im Hunt-Modus.
3. **Given** eine KI auf Stufe „Hunt & Target", die mehrere Treffer in einer Linie erzielt
   hat, **When** sie weiterzielt, **Then** verfolgt sie die erkannte Schiffsachse, bis das
   Schiff versenkt ist.
4. **Given** eine KI auf Stufe „Wahrscheinlichkeitsdichte", **When** sie im Suchmodus ist,
   **Then** beschießt sie das Feld mit der höchsten Anzahl möglicher Platzierungen noch
   lebender Schiffe und nutzt dabei ein Paritäts-/Schachbrettmuster.
5. **Given** identischer Spielzustand und identischer Zufallsstrom, **When** dieselbe KI-Stufe
   zweimal befragt wird, **Then** liefert sie denselben Zug (reproduzierbar).

---

### Edge Cases

- Ein Schuss auf ein bereits beschossenes Feld: wird abgelehnt, zählt nicht, ändert weder
  Zustand noch Zugrecht.
- Eine KI-Anfrage, wenn (rein theoretisch) kein unbeschossenes Feld mehr existiert: die Engine
  liefert keinen ungültigen Zug, sondern signalisiert, dass kein Zug möglich ist.
- Platzierung der Flotte, wenn bei verbotener Berührung schlicht kein gültiges Layout mehr
  passt: die Engine akzeptiert keine ungültige Aufstellung, sondern meldet die Verletzung.
- Sieg-Erkennung bei gleichzeitig letztem Treffer: Sieger ist die Seite, die den letzten
  gegnerischen Schiffsteil versenkt; ein Unentschieden ist in dieser Variante ausgeschlossen.
- Berührungsprüfung an Feldrändern/Ecken: Randlage reduziert die zu prüfenden Nachbarfelder,
  die Regel bleibt unverändert gültig.

## Requirements *(mandatory)*

### Functional Requirements

**Board & Konfiguration**

- **FR-001**: Die Engine MUSS ein rechteckiges Spielfeld bereitstellen, dessen Maße
  konfigurierbar sind, mit dem Standard 10×10.
- **FR-002**: Die Engine MUSS eine konfigurierbare Flottenzusammensetzung unterstützen;
  Standard ist die klassische Flotte: 1×Länge 5, 1×Länge 4, 2×Länge 3, 1×Länge 3, 1×Länge 2.
- **FR-003**: Die Engine MUSS folgende Spielregeln als Konfiguration je Partie aufnehmen:
  Berührung von Schiffen (erlaubt/verboten) und Extrazug-bei-Treffer (an/aus), jeweils mit
  den Standardwerten „erlaubt" und „an".
- **FR-004**: Die Engine MUSS Feldkoordinaten eindeutig adressieren und jede Koordinate als
  „innerhalb" oder „außerhalb" des konfigurierten Felds einordnen.

**Schiffsplatzierung (US1)**

- **FR-005**: Die Engine MUSS Schiffe nur in horizontaler oder vertikaler Ausrichtung
  zulassen.
- **FR-006**: Die Engine MUSS jede Platzierung ablehnen, die das Spielfeld ganz oder teilweise
  verlässt.
- **FR-007**: Die Engine MUSS Überlappungen von Schiffen erkennen und ablehnen.
- **FR-008**: Die Engine MUSS prüfen, dass die platzierte Flotte exakt der konfigurierten
  Zusammensetzung (Anzahl und Längen) entspricht.
- **FR-009**: Bei aktivierter Regel „Berührung verboten" MUSS die Engine jede Platzierung
  ablehnen, bei der zwei Schiffe orthogonal **oder diagonal** aneinandergrenzen
  (Mindestabstand von einem Feld in allen Richtungen).
- **FR-010**: Bei „Berührung erlaubt" MUSS die Engine direkt aneinanderliegende Schiffe
  akzeptieren, solange keine Überlappung vorliegt.
- **FR-011**: Die Engine MUSS bei jeder abgelehnten Platzierung einen eindeutigen,
  maschinen- und menschenlesbaren Grund liefern (außerhalb / Überlappung / Berührung /
  Flottenfehler / Ausrichtung).
- **FR-012**: Die Engine MUSS feststellen können, ob eine Aufstellung vollständig und gültig
  ist (Partie kann beginnen).
- **FR-030**: Die Engine MUSS eine regelkonforme Aufstellung der konfigurierten Flotte
  deterministisch aus einem injizierten Zufallsstrom erzeugen können (Auto-/Zufallsplatzierung),
  die alle Platzierungsregeln inkl. der aktiven Berührungsregel einhält. Dies ermöglicht eine
  vollständige Partie gegen die KI ohne Oberfläche/Server und reproduzierbare Testaufbauten.

**Schussauswertung, Zugrecht & Sieg (US2)**

- **FR-013**: Die Engine MUSS einen Schuss auf eine Koordinate als genau eines von „daneben",
  „Treffer" oder „versenkt" auswerten.
- **FR-014**: Die Engine MUSS einen Schuss auf ein bereits beschossenes Feld als ungültig
  ablehnen, ohne den Zustand oder das Zugrecht zu verändern.
- **FR-015**: Die Engine MUSS einen Schuss außerhalb des Felds sowie einen Schuss durch eine
  nicht am Zug befindliche Seite als ungültig ablehnen.
- **FR-016**: Bei aktiver Extrazug-Regel MUSS dieselbe Seite nach „Treffer" oder „versenkt"
  am Zug bleiben; nach „daneben" MUSS der Zug zur Gegenseite wechseln.
- **FR-017**: Bei deaktivierter Extrazug-Regel MUSS der Zug nach jedem ausgewerteten Schuss
  zur Gegenseite wechseln.
- **FR-018**: Die Engine MUSS „versenkt" genau dann melden, wenn mit diesem Schuss das letzte
  offene Feld eines Schiffs getroffen wurde.
- **FR-031**: Bei „versenkt" MUSS die Engine im Schussergebnis das betroffene Schiff inkl.
  seiner Länge ausweisen, sodass die schießende Seite weiß, welches Schiff (welcher Länge)
  versenkt wurde.
- **FR-019**: Die Engine MUSS den Sieger genau dann erkennen und die Partie als beendet
  kennzeichnen, wenn alle Schiffe einer Seite versenkt sind.
- **FR-020**: Die Engine MUSS jederzeit Auskunft darüber geben, welche Seite am Zug ist und ob
  die Partie noch läuft.
- **FR-034**: Die Engine MUSS zu Spielbeginn deterministisch Spieler A das erste Zugrecht
  geben. Ein zufälliger oder variantenabhängiger Startspieler ist nicht Teil von Meilenstein 1.

**Sichtbarkeit / Fairness**

- **FR-021**: Die Engine MUSS verdeckte Informationen (nicht getroffene gegnerische
  Schiffsfelder) von der für eine Seite sichtbaren Ansicht (eigene Schiffe, eigene/erlittene
  Schüsse, bei Gegner nur die Ergebnisse beschossener Felder) trennen, sodass eine
  konsumierende Anwendung einer Seite niemals verdeckte gegnerische Positionen offenlegen muss.

**KI (US3)**

- **FR-022**: Die Engine MUSS für eine gegebene Spielsituation einen KI-Zug in drei Stufen
  liefern: Zufall, Hunt & Target, Wahrscheinlichkeitsdichte (mit Parität).
- **FR-023**: Jede KI-Stufe MUSS ausschließlich Felder wählen, die im Spielfeld liegen und
  noch nicht beschossen wurden.
- **FR-024**: Stufe „Zufall" MUSS gleichverteilt unter den noch nicht beschossenen Feldern
  wählen und nach einem Treffer **nicht** gezielt nachsetzen.
- **FR-025**: Stufe „Hunt & Target" MUSS bis zum ersten offenen (noch nicht versenkten)
  Treffer im Suchmodus wählen und danach gezielt orthogonal angrenzende Felder beschießen; bei
  mehreren Treffern in einer Linie MUSS sie die erkannte Schiffsachse verfolgen, bis das Schiff
  versenkt ist. Diese Stufe bleibt gegenüber der Berührungsregel agnostisch (nutzt sie nicht).
- **FR-026**: Stufe „Wahrscheinlichkeitsdichte" MUSS für jedes in Frage kommende Feld
  bestimmen, in wie vielen möglichen Platzierungen der noch lebenden Schiffe es enthalten
  wäre, und das Feld mit der höchsten Dichte wählen (reine Dichte, ohne separaten
  Target-Modus); die Dichte MUSS konsistent mit offenen Treffern berechnet werden, sodass sie
  sich nach einem Treffer automatisch um diesen konzentriert. Im Suchmodus MUSS sie ein
  Paritäts-/Schachbrettmuster berücksichtigen.
- **FR-032**: Die schwere Stufe MUSS versenkte Schiffe (anhand der bekannten Länge aus FR-031)
  aus der Menge der lebenden Schiffe für die Dichteberechnung entfernen.
- **FR-033**: Ausschließlich die schwere Stufe MUSS bei aktiver Regel „Berührung verboten" jene
  Platzierungen/Felder aus der Dichteberechnung ausschließen, die an bekannte oder versenkte
  Schiffe angrenzen (orthogonal und diagonal). Die Stufen „Zufall" und „Hunt & Target" werten
  die Berührungsregel nicht aus.
- **FR-027**: Die Engine MUSS signalisieren können, wenn für eine KI kein gültiger Zug mehr
  möglich ist, statt einen ungültigen Zug zu liefern.

**Determinismus & Qualität (verfassungsgemäß)**

- **FR-028**: Die Engine MUSS deterministisch sein: identische Eingaben (inkl. eines
  bereitgestellten Zufallsstroms) MÜSSEN identische Ergebnisse liefern; jeglicher Zufall MUSS
  von außen injizierbar sein und darf nicht intern unkontrolliert erzeugt werden.
- **FR-029**: Die Engine MUSS frei von Annahmen über Oberfläche, Netzwerk, Persistenz oder
  Laufzeitumgebung sein (reine Spiellogik als Single Source of Truth).

### Key Entities *(include if feature involves data)*

- **Board**: Das Spielfeld einer Seite mit seinen Maßen; kennt für jedes Feld den
  Beschuss-Status und (für die eigene Seite) die Schiffsbelegung.
- **Schiff**: Ein Schiff definierter Länge mit Position und Ausrichtung; kennt seine
  getroffenen und offenen Felder und damit seinen „versenkt"-Status.
- **Flotten-Konfiguration**: Die Sollzusammensetzung der Flotte (Anzahl und Längen der
  Schiffe) für eine Partie.
- **Spielregeln-Konfiguration**: Pro Partie gewählte Regeln — Feldmaße, Berührung
  (erlaubt/verboten), Extrazug-bei-Treffer (an/aus).
- **Spielzustand**: Der vollständige Stand einer Partie — beide Boards, welche Seite am Zug
  ist, Trefferhistorie, ob/wer gewonnen hat.
- **Schussergebnis**: Das Resultat eines Schusses — daneben / Treffer / versenkt — samt
  betroffener Koordinate und (bei „versenkt") des betroffenen Schiffs inkl. seiner Länge.
- **KI-Stufe**: Die gewählte Strategie (Zufall, Hunt & Target, Wahrscheinlichkeitsdichte), die
  aus einem Spielzustand und einem Zufallsstrom einen nächsten Zug ableitet.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Eine vollständige Partie (zwei gültige Aufstellungen, abwechselnde Schüsse bis
  zum Sieg) lässt sich allein mit der Engine von Anfang bis Ende durchspielen, ohne
  Oberfläche oder Server.
- **SC-002**: 100 % der unzulässigen Platzierungen (außerhalb, Überlappung, falsche Flotte,
  unzulässige Berührung, schräge Ausrichtung) werden abgelehnt; 100 % der zulässigen werden
  akzeptiert.
- **SC-003**: 100 % der Schussauswertungen liefern das korrekte Ergebnis (daneben/Treffer/
  versenkt) und das korrekte Zugrecht gemäß der (de)aktivierten Extrazug-Regel; doppelte oder
  ungültige Schüsse verändern den Zustand nie.
- **SC-004**: Der Sieger wird in 100 % der Partien genau dann erkannt, wenn die letzte
  gegnerische Schiffszelle versenkt ist — nie früher und nie später.
- **SC-005**: Jede KI-Stufe liefert in jeder erreichbaren Spielsituation einen zulässigen Zug
  (im Feld, noch nicht beschossen) bzw. signalisiert korrekt, dass kein Zug möglich ist.
- **SC-006**: Die drei KI-Stufen sind in ihrer Spielstärke klar unterscheidbar: über eine
  reproduzierbare Serie von mindestens 100 Partien mit fester Seed-Liste benötigt
  „Wahrscheinlichkeitsdichte" im Mittel mindestens 10 % weniger Schüsse zum Sieg als
  „Hunt & Target", und dieses mindestens 10 % weniger als „Zufall".
- **SC-007**: Bei identischem Spielzustand und identischem Zufallsstrom liefert jede KI-Stufe
  reproduzierbar denselben Zug (Determinismus nachweisbar).
- **SC-008**: Der Aufstellungsgenerator erzeugt in 100 % der Fälle eine vollständige, gültige
  Flotte gemäß der aktiven Regeln (inkl. Berührungsregel) und liefert bei identischem
  Zufallsstrom reproduzierbar dieselbe Aufstellung.

## Assumptions

- Meilenstein 1 umfasst ausschließlich die framework-unabhängige Spiel-Engine und die KI;
  Oberfläche, Netzwerk/Server, Authentifizierung, Lobbys, Statistiken, Reconnect und
  Zug-Timer sind **nicht** Teil dieses Features (spätere Meilensteine).
- Der Zug-Timer und dessen Zusammenspiel mit der Extrazug-Regel ist serverseitig und damit
  außerhalb dieses Scopes; die Engine bildet nur die spiellogische Extrazug-Regel ab.
- „Berührung verboten" wird als Mindestabstand von einem Feld in alle acht Richtungen
  interpretiert (orthogonal **und** diagonal), passend zur klassischen „kein Anstoßen"-Regel.
- Die Extrazug-Regel wird in der Engine als konfigurierbar abgebildet (Standard „an"),
  konsistent mit den vorgesehenen Lobby-Einstellungen, auch wenn Meilenstein 1 primär mit dem
  Standard arbeitet.
- Ein Unentschieden ist in dieser Variante nicht möglich; es gewinnt, wer zuerst alle
  gegnerischen Schiffe versenkt.
- Variantenregeln über die genannten hinaus (z. B. „Salvo", Power-ups, abweichende
  Feldgrößen jenseits der Konfigurierbarkeit) sind nicht Teil dieses Features.
- Der Startspieler ist in Meilenstein 1 deterministisch Spieler A; eine Zufalls-/Variantenwahl
  des Starts (wie im Gesamtprojekt angedeutet) ist späteren Meilensteinen vorbehalten.
- Zufall wird der Engine als injizierbarer Strom übergeben; das Auswählen/Erzeugen eines
  konkreten Seeds liegt bei der konsumierenden Anwendung.
