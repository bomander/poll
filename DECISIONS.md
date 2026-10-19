# DECISIONS - enkat

## 2026-02-24 - Dokumentstruktur etablerad
- Kontext: Behov av en enhetlig modell for intent, guardrails och beslut.
- Beslut: Appen dokumenteras med `INTENT.md` och `DECISIONS.md`.
- Konsekvens: Snabbare och tydligare prioriteringar vid vidareutveckling.
- Uppfoljning: Fyll pa med beslut vid varje storre andring.

## 2026-10-19 - Tydligare flöden och projektorvy
- Kontext: Lärarflödena var otydliga, eleverna såg resultat innan de svarat och projektorvyn visade koden för litet.
- Beslut: Läraren styr om resultatet syns för klassen och kan dölja enskilda ordmolnssvar. Eleverna ser resultat först efter sitt eget svar. Projektorvyn visar adress, kod och QR-kod stort. Nya koder är sex tecken utan lättförväxlade tecken. Gränssnittet säger enkät och omgång i stället för poll och session.
- Konsekvens: `/api/join` och röstsvaret delar format (`ParticipantState`) och skickar inga resultat när de är dolda. Lärare kan radera enkäter.
- Uppföljning: Pröva projektorvyn i ett klassrum och se om standardläget (resultat synliga) bör ändras.

## 2026-10-19 - Flera frågor per enkät
- Kontext: En lärare som ville stämma av flera saker behövde starta flera omgångar med olika koder.
- Beslut: En enkät har 1–10 frågor av samma typ. Läraren stegar fram med Föregående och Nästa, och eleverna går med en gång.
- Konsekvens: Elevvyn och projektorn följer den aktuella frågan. CSV-exporten omfattar alla frågor.
- Uppföljning: Inga blandade frågetyper i samma enkät förrän en lärare behöver det.

## 2026-10-19 - Teman för elevvy och projektor
- Kontext: Elevvyerna kändes som ett adminverktyg. Först kom en lekfull stil, sedan önskemål om fler teman.
- Beslut: Elva teman (Lekfullt, Rymd, Skog, Hav, Pixel, Svarta tavlan, Arena, Pastell, Tidning, Bauhaus, Klar) väljs per enkät och sparas i `polls.settings.theme`. Temat är bara utseende och får bytas även efter att enkäten har körts. Startsidan använder alltid Lekfullt.
- Konsekvens: Komponenterna läser CSS-variabler och temats färglista. Textfärgen på färgade ytor väljs efter kontrast. Frågor och alternativ visas i ett läsbart typsnitt även i Pixel.
- Uppföljning: Inga fler teman utan konkret behov. Lärarvyn har kvar sitt neutrala utseende.

