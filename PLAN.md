
---

Målbild

1. Huvudsidan (live-tid):

NU ligger alltid i mitten (2 rader före + 1 NU + 2 efter).

Progress-emoji rör sig höger → vänster och träffar “hålet” exakt när nästa start inträffar.

“Klar” påverkar bara pågående block för aktuell person.

“Klar sent” gäller endast rader ovanför NU och triggar lokal replan (proportionellt → närmsta fixed start i kedjan), utan att förstöra mallar.



2. Dagstyper & expansion:

SchoolDay / OffDay / FritidsDay väljs automatiskt per datum (regler + undantag).

Dagens rutinschema genereras av en mall (template) som skapar dagens händelser (“instans”).

Mall förblir orörd; dagens instans får overrides (“Klar sent” m.m.).



3. Google Calendar-synk:

Egen “Routine” kalender per person för rutinhändelser som vår app äger.

Externa händelser (möten, tandläkare) läses read-only från användarens övriga kalendrar & visas i griden → påverkar dagstyp/sekvensering (t.ex. kväll tidigare om möte kl 06:30).

Tvåvägs synk endast för vår “Routine” kalender.

Ingen dubblett: stabil externalId + extendedProperties.private i Google-event.





---

Begrepp (kontrakt)

DayType: "SchoolDay" | "OffDay" | "FritidsDay".

TemplateStep (mallsteg): key, personId, title, at eller offsetMin, minDurationMin, fixedStart, dependsOnKeys, involved, resource, location, cluster, atByNextDayType.

Expanded Event (dagens instans): har riktiga start/end (end = nästa start), plus meta.templateKey och dayType.

GoogleEvent link:

extendedProperties.private.appId = vår interna ID (t.ex. leia-hair-2025-09-12)

extendedProperties.private.dayType

extendedProperties.private.minDurationMin / fixedStart / dependsOn / involved / resource / location (JSON)




---

Datakällor & sanning

Primary truth för rutiner: mallen + vår dagliga expansion + lokala overrides i appen.

Primary truth för externa händelser: Google Calendar.

Skrivning till Google: endast vår Routine-kalender. Externa kalendrar lämnas orörda.



---

Flöde på huvudsidan (live)

1. Nu-klocka: nowMs tickar i realtid (Stockholm TZ). NU-raden hålls visuellt centrerad.


2. Dagstyp: klassificera todayType = classifyDay(today, RULES) och även tomorrowType (påverkar kvällens tider).


3. Expansion: expandProfileForDate(today, PROFILES[todayType], tomorrowType) → routineEventsToday.


4. Google-pull: hämta googleEventsToday för tidsfönster [00:00, 24:00) inkl. all-day (som block), från:

“Routine – {Person}” (vår)

övriga kalendrar (read-only)



5. Merge till visning:

Baslista = routineEventsToday.

Lägg in “Routine-Google” uppdateringar (om status/namn ändrats av användaren i Google i efterhand).

Lägg in externa Google-events som låsta block (resurser/required kan påverka väntan).

Applicera lokala overrides (Klar sent → replan, etc.).



6. Render: event-baserad grid (5 rader), ikon/emoji, varför-väntar-vi (dependsOn/required/resource), NU-progress höger→vänster.




---

Google-synk (tekniskt)

Setup

OAuth 2.0 (user consent). Scope:

Read: https://www.googleapis.com/auth/calendar.readonly

Write (endast vår kalender): https://www.googleapis.com/auth/calendar (eller .../calendar.events)


Per person: skapa/förvänta en kalender: “Routine – {Person}”. Lagra calendarId i vår profil.

TZ: sätt timeZone = "Europe/Stockholm" när vi skapar/uppdaterar events.


ID-strategi & dubbletter

Vår interna ID per dagens rutin: "{personId}-{templateKey}-{YYYY-MM-DD}".

När vi skapar i Google:

summary = title

start.dateTime / end.dateTime = vår instans

extendedProperties.private.appId = internalId

Lagra googles id i vår lokala indexkarta gIdByAppId.


Vid upsert:

Finns gIdByAppId[internalId] → PATCH det Google-eventet.

Annars “search by private.appId” (list query filter) → om träff, uppdatera; annars POST nytt.



Riktning & granularitet

Pull (inkrementell):

Använd syncToken från Calendar API för events.list → minimal diff sedan förra körningen.

Alternativ/komplement: watch (push-kanaler) för snabb uppdatering.


Push (vår sida):

Endast till Routine kalendrar.

Vid “Klar sent”/replan: uppdatera berörda appIds.

Vid “Klar”: valfritt flagga status="confirmed" + ev. colorId i vår kalender (visuell feedback i Google).



Fält-mappning

Min-tid: extendedProperties.private.minDurationMin (nummer)

Fixed start: extendedProperties.private.fixedStart = true samt sätt start.dateTime exakt; om användaren flyttar i Google, tolka som override.

Beroenden: extendedProperties.private.dependsOn = '["appId1","appId2"]' (JSON string)

Involved: extendedProperties.private.involved = '[{"personId":"maria","role":"required"}]'

Resurs/Plats: extendedProperties.private.resource, location (Google har eget location-fält; behåll båda).

DayType/TemplateKey: extendedProperties.private.dayType, ...templateKey.


Konflikter & lås

Om användaren redigerar vår Routine-händelse i Google:

Vi läser ändringen och visar den (override).

Skriv tillbaka endast om ändringen är kompatibel; annars markera i UI (⚠ Manuell ändring i Google).


Externa kalenderhändelser styr väntan/resurser i vår grid men skrivs aldrig av appen.



---

Dagstyp som påverkar kvällen

När huvudsidan laddar/byter datum:

1. todayType = classifyDay(today, RULES)


2. tomorrowType = classifyDay(today+1, RULES)


3. I expansionen används atByNextDayType för kvällsblock (t.ex. läggdags +60 min om Off/Fritids i morgon).



Om Google visar ett mycket tidigt möte i morgon (t.ex. 06:30), kan en regel tidigarelägga läggdags (heuristik):

“Morgonmöte < 07:00” ⇒ tvinga kvällens läggdags till SchoolDay-nivå.




---

UI-beteende (huvudsidan)

NU i mitten: currentRowIndex beräknas mot nowMs; startIndex = currentRowIndex - 2; ingen “autoscroll animation”, bara hårt klipp när nya starttider passerar (enligt ditt önskemål).

Knappar:

“Klar” endast på NU-raden.

“Ej klar” + “Klar sent” endast ovanför NU; “Klar sent” kräver nowMs > plannedEnd.


“Väntar på …”: visas när dependsOn, required-närvaro, resurs eller co-location blockerar start.

Emoji-hastighet mappas mot TOTAL segmenttid (från aktuell start → nästa start). Byter automatiskt vid replan.



---

Edge cases

Sommartid/zon: alltid “Europe/Stockholm”; använd dateTime + timeZone i Google.

All-day events: rendera som lås/block hela dagen (ex: “Skollov”).

Dubbelbokning av resurs: “Väntar på bilen/badrum”.

Många snabba steg: grid är händelsebaserad (fast kortstorlek); många korta steg är läsbara.

Offline: cachea senaste googleEventsToday + syncToken; köa writes till Routine-kalendrar.

Rate limits: batcha writes (1 PATCH/POST per 250 ms), exponential backoff.



---

Roller/kalendrar (rekommendation)

Antony/Maria/Leia/Gabriel får vardera en Routine-kalender (delbar vid behov).

I UI kan du slå av/på visning per person.

Familjevy: visa endast händelser med involved.length ≥ 2 eller samma start mellan ≥2 personer.



---

Implementationssteg (pragmatisk ordning)

1. Huvudsidan:

Håll NU centrerad (klar).

Lägg in klassificering + expansion i stället för testlistan (utan Google först).

Visa “Väntar på …” (dependsOn/required/resource).



2. Google – läsning (read-only):

OAuth, lista kalendrar, välj vilka som är “externa” vs “Routine – {Person}”.

Dra in events för idag (list range). Blanda in i griden.



3. Google – skriv (bara Routine):

Skapa/peka ut “Routine – {Person}”.

Upsert med extendedProperties.private.appId.

Hantera dubbletter.

“Klar sent” → PATCH berörda Routine-events.



4. Inkrementell sync:

syncToken och/eller watch kanaler för snabb refresh.

UI uppdateras utan att NU flyttar sig.



5. Regel-UI:

Enkel panel för fritidsDates, breaks, per-datum override.

Spara lokalt (senare: Firestore/Supabase).



6. Polish:

Läggdagsheuristik mot “i morgon tidigt möte”.

Visuell markering av Google-manuell ändring på Routine-event.

Export/import av mallar.





---

Testplan (kritiskt)

Dagstyp: vardag → SchoolDay; helg → OffDay; fritidslista → FritidsDay.

Kväll mot i morgon: Off/Fritids i morgon ger +60 min läggdags; School i morgon drar tillbaka till 21:00.

Replan: “Klar sent” före 07:45/08:00 minskar planerat fram till närmsta fixed; emoji-hastighet uppdateras.

Google:

Skapa Routine-event → syns i Google med extendedProperties.

Flytta Routine-event i Google → vår UI läser ändringen (flagga override).

Extern Google-händelse 06:30 → kväll backas via heuristik (om slått på).

All-day lov → OffDay utan mallkollision.




---

När Google-nyckeln är klar

Sätt upp OAuth-client, redirect URI.

Lagra refresh_token krypterat.

Första gång: skapa “Routine – {Person}” om den saknas, spara calendarId.

Starta read loop (list + syncToken) och write queue för Routine-ändringar.



---

Den här planen gör att rutinkalendern (sekvenser, min-tider, beroenden) styr UI/assistens, medan Google ger externa constraints och fungerar som delad sanningskälla för “verkliga” händelser — utan att mallar förstörs eller dubbletter skapas. När du vill, kan jag skriva precisa kodstubs för: OAuth-init, listEvents med syncToken, upsertRoutineEvent, och merge-logiken mot expandedEventsToday.
