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
