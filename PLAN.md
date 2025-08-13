# Projektplan & Teknisk Vision

Detta dokument beskriver den övergripande visionen, arkitekturen och den tekniska implementeringsplanen för VisuCal.

---

## 1. Grundidé & Målbild

### 1.1. Grundidé med appen

Visuell kalender med bildstöd som automatiskt sekvenserar rutiner beroende på vilken typ av dag det är.

Tre dagstyper:
*   **Skoldag** – vanlig vardag, tidiga läggtider.
*   **Icke-skoldag** – helg/lov, senare läggtider.
*   **Fritidsdag** – skoldag för ett barn, helg för ett annat; påverkar rutiner för både dagen och kvällen innan.

Dagstypen styr vilken återkommande mall som används för dagens och kvällen innan scheman.

### 1.2. Målbild för Huvudsidan (Live-tid)

*   **NU i mitten:** Visar alltid ett fönster av händelser centrerat kring den aktuella tiden (t.ex. 2 rader före + 1 NU + 2 efter).
*   **Progress-emoji:** En emoji rör sig från höger till vänster för att visualisera tiden som återstår av en aktivitet, och träffar "hålet" precis när nästa aktivitet börjar.
*   **"Klar"-knapp:** Påverkar endast den pågående händelsen för den specifika personen.
*   **"Klar sent"-knapp:** Är endast tillgänglig för händelser som har passerat sin planerade sluttid. Den triggar en lokal omplanering som proportionellt krymper efterföljande händelser fram till nästa fasta tidpunkt, utan att ändra i den grundläggande mallen.

### 1.3. Målbild för Google Calendar-synk

*   **Egen "Routine"-kalender:** Appen hanterar en specifik kalender per person (t.ex. "Routine – Leia") för alla mall-genererade händelser.
*   **Externa händelser (Read-only):** Möten och andra bokningar från användarens vanliga kalendrar läses in som låsta block och kan påverka sekvenseringen (t.ex. tidigarelägga kvällsrutinen om ett tidigt möte finns nästa dag).
*   **Inga dubbletter:** En stabil ID-strategi (`extendedProperties.private.appId`) används för att säkerställa tvåvägssynkronisering utan att skapa dubbletter.

---

## 2. Arkitektur & Begrepp

### 2.1. Begrepp (Kontrakt)

*   **DayType:** `"SchoolDay" | "OffDay" | "FritidsDay"`.
*   **TemplateStep (Mallsteg):** Definitionen av en återkommande händelse i en mall. Innehåller `key`, `personId`, `title`, tidsinformation (`at`, `offsetMin`, `atByNextDayType`), metadata (`minDurationMin`, `fixedStart`, `dependsOnKeys`, `involved`, `resource`, `location`, `cluster`).
*   **Expanded Event (Dagens instans):** En konkret händelse för en specifik dag, genererad från en `TemplateStep`. Har en riktig start- och sluttid samt referenser till sin mall.
*   **GoogleEvent Link:** Hur en Google Calendar-händelse mappas till en instans i vår app via `extendedProperties.private`.

### 2.2. Datakällor & Sanning

*   **Primary Truth (Rutiner):** Appens mallar (`TemplateStep`) + den dagliga expansionen (`Expanded Event`) + lokala justeringar (`overrides`).
*   **Primary Truth (Externa händelser):** Användarens Google Calendar.
*   **Skrivning till Google:** Appen skriver *endast* till de dedikerade "Routine"-kalendrarna.

### 2.3. Flöde på Huvudsidan (Live)

1.  **Nu-klocka:** `nowMs` tickar i realtid. NU-raden hålls visuellt centrerad.
2.  **Dagstyp:** Klassificera `todayType` och `tomorrowType` baserat på `RULES`.
3.  **Expansion:** `expandProfileForDate(...)` genererar `routineEventsToday` från mallen.
4.  **Google-pull:** Hämta Google-händelser (både "Routine" och externa) för dagen.
5.  **Merge:** Kombinera `routineEventsToday`, Google-händelser och lokala `overrides` till en slutgiltig lista för rendering.
6.  **Render:** Visa griden med all information, inklusive "väntar på"-status och progress-emojis.

---

## 3. Implementationsplan (Aktiv Att-göra-lista)

**Instruktion till AI-assistenter:** Denna sektion är en aktiv att-göra-lista. När du slutför ett steg, uppdatera denna plan för att reflektera vad som är klart (`✅`), pågående (`❗`), eller nästa steg (`🔜`).

### Kort status/roadmap (cheat-sheet)

*   `✅` NU-vy live, replan-grund, grundläggande mallmotor, dokumentation finns.
*   `❗` Verifiera att mallen verkligen används korrekt i UI (Task 1).
*   `🔜` Knapplogik (Klar/Ej klar), Spara i EditSheet, WhyBlocked, fler DayTypes, visuell replan-preview, polish av NU-linje, HUD.
*   `⏭️` GCal-sync (när nycklarna är redo).

### Detaljerad Plan

**0) Globala regler (måste följas)**

*   Ändra inte `package.json`/deps.
*   Små PR:er.
*   Bygg till `dist/`.
*   Ingen live-deploy, endast ev. preview-kanal.

**1) Synliggör att mallmotorn verkligen körs (snabb verifiering)**
*   **Fil(er):** Main + ev. recurrence.ts
*   **Gör:**
    *   Visa aktiv `DayType` (SchoolDay/OffDay/FritidsDay) uppe till vänster i Main.
    *   Lägg liten debug-badge: “events: N” (antalet genererade för idag).
    *   Lägg en tillfällig `select` (endast dev-mode) för att växla `DayType` i minnet och forcerat re-expandera dagen (så vi kan bevisa att mallen används).
*   **Definition of Done:**
    *   Byter jag till en annan `DayType` (dev-select) ändras listan tydligt utan reload.
    *   Badge visar korrekt antal events.
*   **Manuellt test:**
    *   Öppna Main → se `DayType`-badge och events-count.
    *   Växla `DayType` i dev-select → listan ändras (bevis för att recurrence.ts körs).

**2) Knapplogik: “Klar”, “Ej klar” (ersätter “Klar sent”)**
*   **Fil(er):** CalendarGrid, GridCell (där knapparna renderas)
*   **Gör:**
    *   **NU-rad:** endast `Klar` (klickbar).
    *   **Rader ovanför NU (passerat):** visa `Ej klar` (klickbar). Ta bort “Klar sent” i UI (enligt önskemål; behåll ev. intern fn för senare).
    *   **Rader under NU:** inga åtgärdsknappar.
*   **Definition of Done:**
    *   “Ej klar” syns endast på passerade rader, är klickbar.
    *   “Klar” syns endast på NU-raden.
*   **Manuellt test:**
    *   Låt tiden passera en rad → “Ej klar” syns där, “Klar” bara i NU.

**3) Wire “Spara” i EditEventSheet → uppdatera metadata i state**
*   **Fil(er):** EditEventSheet, events-store/context
*   **Gör:**
    *   Koppla “Spara” så att metadata (`minDurationMin`, `fixedStart/End`, `dependsOn`, `involved`, `resource`, `location`, `cluster`) skrivs in i state och triggar re-render.
    *   Lägg grundvalidering:
        *   `minDurationMin` ≥ 0
        *   `involved.required` får inte vara tom om `allowAlone=false` (om fältet finns)
        *   `dependsOn` får inte peka på okänt id.
*   **Definition of Done:**
    *   Ändrar jag t.ex. `minDurationMin` eller `resource` och sparar → cellens badges uppdateras direkt.
*   **Manuellt test:**
    *   Öppna kugghjul → ändra `minDurationMin` → spara → se uppdaterad badge `min:Xm`.

**4) “Väntar på…” (whyBlocked) – första version**
*   **Fil(er):** whyBlocked.ts, integrera i cell-rendering
*   **Gör (MVP):**
    *   Om event A inte kan starta p.g.a. ouppfyllda `dependsOn` → returnera “Väntar på <titel/person>”.
    *   Om `resource` konflikt (samtidigt nyttjande) → “Väntar på <resurs>”.
    *   Om `required` person är upptagen i annat pågående event → “Väntar på <namn>”.
*   **UI:**
    *   Visa liten grå badge med texten under titeln i cellen.
*   **Definition of Done:**
    *   Minst ett scenario per typ (dependsOn / resource / person) visar korrekt “Väntar på…”.
*   **Manuellt test:**
    *   Skapa enkel konflikt (t.ex. två som behöver “badrum” samtidigt) → badge ska synas.

**5) Utöka dagstypernas mallar (OffDay + FritidsDay)**
*   **Fil(er):** recurrence.ts
*   **Gör:**
    *   Fyll `OffDay` (helg/lov): senare läggtid kvällen innan, friare morgon.
    *   Fyll `FritidsDay`: skoldagstider för Leia, helg-liknande för Gabriel, vanliga jobbdagar för vuxna. Anpassa kväll före.
    *   Se till att `expandDay(date)` tar hänsyn till kvällen innan (t.ex. läggtid) genom att templaten för “kväll före” bestäms av morgondagens `DayType`.
*   **Definition of Done:**
    *   När jag växlar `DayType` (dev-select) i Main, ändras både morgon och (om visad) kväll före enligt reglerna.
*   **Manuellt test:**
    *   Byt till `OffDay` → morgon/kväll beter sig annorlunda än `SchoolDay`.
    *   Byt till `FritidsDay` → Leia får “skol-liknande” tider, Gabriel helg-liknande.

**6) Replan-preview: visuell feedback utan att ändra state**
*   **Fil(er):** grid-utils.ts (`previewReplanProportional`, finns redan), GridCell/CalendarGrid
*   **Gör:**
    *   Vid klick på `Ej klar` (passerad rad) kör `previewReplanProportional(...)`.
    *   Visa icke-invasiv overlay på berörda celler i UI:
        *   markera föreslagen ny starttid (diskret text i cellen),
        *   visa att röd zon kan växa (om min-tid äter upp plan-tid),
        *   ändra emoji-hastighet lokalt i render (utan att mutera state) för att indikera snabbare/långsammare progress.
    *   Lägg en enkel “Nollställ preview” (t.ex. knapp i toolbar) som tar bort highlighten (ingen state-mutation behövs).
*   **Definition of Done:**
    *   Tryck på “Ej klar” ovanför NU → syns en tydlig men temporär preview i UI (utan att spara).
    *   “Nollställ preview” rensar.
*   **Manuellt test:**
    *   Testa både fall `status:"ok"` (med λ) och `status:"insufficientFlex"` (visa liten varning i cellerna som berörs).

**7) Lab-sida: simulering + kontroller + metadata-toggle (om inte redan komplett)**
*   **Fil(er):** Lab + EventGrid
*   **Gör:**
    *   Säkerställ: play/pause, hastighet (2 / 5 / 10 s/timme), Jump 07/12/18.
    *   Toggle “Visa metadata” och “Progress på alla rader”.
    *   Lägg liten HUD: `now`, `currentRowIndex`, `startIndex`, aktiv `DayType`, senaste preview-status.
*   **Definition of Done:**
    *   Allt ovan fungerar utan reload; metadata-badges visas när togglen är på.
*   **Manuellt test:**
    *   Växla toggles och hastigheter, se HUD uppdateras.

**8) NU-linje & klipp (polish)**
*   **Fil(er):** EventGrid
*   **Gör:**
    *   NU-linjen ska alltid ligga perfekt över mittenraden (justera ev. pixel-offset).
    *   Vid fönsterbyte (ny starttid passerar): hårt klipp i data, men applicera 120 ms CSS-transition (`translateY`) på wrapper för mjuk känsla. Ingen “glidande tid”.
*   **Definition of Done:**
    *   Ingen “drift”: NU-linjen exakt mitt.
    *   Byte känns mjukt men sker omedelbart.
*   **Manuellt test:**
    *   Simtid med hög hastighet → stabil mitten och mjuk nudge vid byten.

**9) Dokumentation – hur man testar**
*   **Fil(er):** `PLAN.md` / `README.md`
*   **Gör:**
    *   Lägg in en ”Test checklist”:
        *   Hur man växlar `DayType` i dev-select och ser förändringen.
        *   Hur man öppnar `EditEventSheet` och ändrar metadata (Spara → badges uppdateras).
        *   Hur man triggar “Ej klar” och tolkar `replan-preview`.
        *   Varför “Klar sent” inte visas (ersatt av “Ej klar”).
        *   Hur “Väntar på…” visas i tre exempel (dependsOn/person/resource).
*   **Definition of Done:**
    *   Jag kan följa listan och återskapa allt som är viktigt, utan att fråga.

---

### Avancerad logik – senhetskontroll

Målet är att systemet ska kunna upptäcka och markera om man riskerar att bli sen och anpassa schemat därefter.

*   **Beroenden (`dependsOn`):** Vissa steg kräver att andra är klara först.
*   **Resurser:** T.ex. badrum, bil, person; kan bara användas av en åt gången.
*   **Minsta varaktighet:** En uppgift kan inte kortas under sin minsta tid.
*   **Fasta tider (`fixedStart`, `fixedEnd`):** Tider som inte kan flyttas.
*   **Involverade personer:** Aktiviteter som kräver en viss person eller kombination.

**Logiken fungerar så här:**
1.  Om ett event riskerar att starta efter sin planerade starttid p.g.a. beroenden eller resurskonflikter → markera som `risk för sen start`.
2.  Om det närmar sig sluttiden och minsta tid + beroenden gör att man inte hinner innan nästa fast start → markera som `kommer bli sen`.
3.  När “Klar sent”-knappen trycks, körs en `replan-preview` där schemat krymper proportionellt fram till nästa fast start, och eventet flyttas efter “nu”-markören.

---
*Detta dokument ska uppdateras kontinuerligt allt eftersom stegen i planen slutförs.*
