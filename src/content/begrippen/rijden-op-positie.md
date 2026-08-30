---
title: "Rijden op positie"
summary: "De besturing berekent waar een trein in een blok is, en stopt hem op de centimeter nauwkeurig zonder extra melders."
category: besturing
---

Een bezetmelder zegt alleen *dat* er een trein in een blok staat, niet waar
precies. Bij rijden op positie rekent de besturing dat zelf uit. Zodra de trein
een blok binnenrijdt, weet de software het beginpunt. Vanaf dat moment houdt
zij bij hoe hard de trein rijdt en hoe lang, en daaruit volgt hoe ver de trein
het blok in is.

Daarvoor moet de software van elke locomotief weten hoe snel die werkelijk
rijdt bij elke rijstap. Dat wordt vooraf ingemeten: de loc rijdt over een
stuk spoor met bekende lengte en de software noteert per stap de gemeten
snelheid. Ook de lengte van elk blok moet zijn ingevoerd.

Het resultaat is dat een trein netjes op een gekozen plek kan stoppen,
bijvoorbeeld met de eerste deur bij het perron of vlak voor een sein, zonder
dat daar een aparte melder voor nodig is. Ook lange treinen die groter zijn
dan een perron kunnen zo op de juiste plek tot stilstand komen. iTrain werkt
op deze manier op onze banen.
