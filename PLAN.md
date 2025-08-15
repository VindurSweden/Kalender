# VisuCal Teknisk Vision & Implementationsplan

Här är en kompakt guide för vilka frågor som behövs för metadata – och hur du gör manuell inmatning superenkel (både med röst och via ett snabbt formulär). Allt matchar den modell vi använder (min-tid, beroenden, resurser, involverade, fixed times, dagstyp m.m.).

---

## 1) Vilken metadata behöver vi?
Minsta användbara schema per event (fält i appen):

*   **title** (namn)
*   **personId** (vem “äger” uppgiften)
*   **involved[]**: { personId, role: "required" | "helper" }
*   **minDurationMin** (minsta möjliga tid)
*   **fixedStart?** (ja/nej) + ev. startPlanned (ISO eller HH:MM)
*   **fixedEnd?** (ja/nej) + ev. endPlanned (ISO eller HH:MM)
*   **dependsOn[]?** (event-nycklar som måste vara klara före)
*   **resource?** (badrum, bil, kök…)
*   **location?** (hemma, skola, jobb…)
*   **allowAlone?** (kan göras utan hjälpare)
*   **dayType?** ("SchoolDay" | "OffDay" | "FritidsDay")
*   **cluster?** (t.ex. “Morgonrutin”)
*   **imagesKey?** (ikon/bildtagg)

---

## 2) Frågebatteri (röstläge): minimalt → utökande

### A. Snabb (2–3 frågor, bra default)
1.  **Vad ska göras?**
    *   “Namn på aktiviteten?” → `title`
2.  **Vem gäller det?**
    *   “Vem ska göra det?” → `personId` (förval = den som pratar)
3.  **Hur snabbt går det i nödfall?**
    *   “Minsta tid om du skyndar?” → `minDurationMin`

(Efter svar kan assistenten själv föreslå resten via heuristik.)

### B. Tillägg (bara om relevant)
*   **När börjar det/behöver det börja?**
    *   “Fast starttid eller flexibelt?” → `fixedStart` + `startPlanned` (om fast)
*   **Måste det vara klart senast?**
    *   “Finns deadline/fixed slut?” → `fixedEnd` + `endPlanned` (om fast)
*   **Vem behövs?**
    *   “Behövs hjälp, och av vem?” → `involved[]` + `allowAlone`
*   **Vad måste vara klart före?**
    *   “Finns något som måste ske före?” → `dependsOn[]` (sök/föreslå)
*   **Var och med vad?**
    *   “Vilken plats och resurs används (badrum, bil…)?” → `location`, `resource`
*   **Vilken dagstyp?**
    *   “Gäller detta skoldag, icke-skoldag eller fritidsdag?” → `dayType` (förval: dagens)
*   **Grupp/kluster?**
    *   “Tillhör det en rutin (morgon/kväll)?” → `cluster`

---

## 3) Snabbform (UI) – 15 sekunder, 3 steg

*   **Steg 1 (överst, stora knappar):**
    *   **Titel** (chips med senaste/vanliga: “Frukost”, “Borsta tänder”, “Packa”, “Läxor” …) + fritext
    *   **Vem** (avatar-chips: Maria, Antony, Leia, Gabriel)
*   **Steg 2 (”Tid & typ”):**
    *   **Min-tid** (snabbknappar: 2, 5, 10, 15, 20, 30; + fält)
    *   **Dagstyp** (School/Off/Fritids; default = auto)
    *   **Fixed start?** (toggle) → ställer fram HH:MM om på
    *   **Fixed slut?** (toggle) → HH:MM om på
*   **Steg 3 (”Beroenden & resurser” – progressiv visning):**
    *   **Involverade** (chips: required/helper; “självOK” toggle)
    *   **Resurs** (chips: 🛁 badrum, 🚗 bil, 🍳 kök …)
    *   **Plats** (hemma/skola/jobbet/annat)
    *   **Beroenden** (autocomplete: föreslå sannolika föregångare, t.ex. “Frukost” före “Vitaminer”)

**Primärknapp:** “Spara” (skapar event). **Sekundär:** “Spara & lägg nästa i samma kluster”.

---

## 4) Micro-UX för låg friktion
*   Chips > dropdowns (snabb motorik, dyslexi-vänligt).
*   Auto-fyll (`dayType`, `location`) utifrån tid på dygnet + historik.
*   Fuzzy-match för titlar (“tand” → “Borsta tänder”).
*   Synonymkarta (träning=fotboll=bollträning → samma bild).
*   Intelligenta default för min-tid per person/aktivitet (lärs in).
*   “Lägg till igen”: duplicera senaste med ett tryck (för mikro-steg).
*   Konfliktvarning inline (“Badrum redan bokat 07:15–07:25”).
*   “Föreslå beroenden”-knapp (t ex: Frukost → Vitaminer → Borsta tänder).
*   **Kortkommandon:**
    *   “+5 min buffert”
    *   “Lås start” / “Lås slut”
    *   “Gör ensam OK” / “Måste ha hjälp”

---

## 5) Förifyllning (regler som sparar tid)
*   **Aktivitetsprofiler:**
    *   **“Borsta tänder”**: `minDurationMin=3`, `resource=bathroom`, `allowAlone=false` för Leia, `true` för Gabriel, `dependsOn=Frukost?` (heuristik).
    *   **“Vitaminer”**: `min=1`, `dependsOn=Frukost`.
    *   **“Frukost”**: `min=10`, `resource=kitchen`, `involved: required=Antony|Maria`, `helpers=kids`.
*   **Dagstyp påverkar kvällen före:** väljer du “SchoolDay” för i morgon → föreslå “Kvällsrutin (skoldag)” i kväll.

---

## 6) Redigering i efterhand (”kugghjulet”)
I `EditEventSheet` (måste vara enkel):
*   Överst: titel, ägare, kluster.
*   Sektion **Tid**: min-tid (chips+fält), fixed start/slut toggles + HH:MM.
*   Sektion **Roller**: required/helpers (avatar-chips), “självOK” toggle.
*   Sektion **Resurser/Plats**: chips + “+Ny resurs”.
*   Sektion **Beroenden**: autocomplete + snabbknapp “Föreslå”.
*   **Spara** skriver direkt till state och uppdaterar badges.
*   **Validering:**
    *   min-tid ≥ 0
    *   om `allowAlone=false` krävs minst en `required` i `involved`
    *   `dependsOn` måste finnas i dagens event

---

## 7) Snabb röst-till-metadata (exempel)
Kommando: *“Lägg till Borsta tänder för Leia. Minsta tid 3 minuter. Efter frukost. I badrummet. Behöver hjälp av Antony. Skoldag.”*

Assistenten fyller:
```json
{
  "title": "Borsta tänder",
  "personId": "leia",
  "minDurationMin": 3,
  "dependsOn": ["frukost"], 
  "resource": "bathroom",
  "involved": [{"personId":"antony","role":"required"}],
  "dayType": "SchoolDay",
  "allowAlone": false,
  "cluster": "Morgonrutin"
}
```

---

## 8) Två färdiga mall-exempel (för att testa snabbt)
**A) “Laga mat” (Antony)**
*   title: Laga mat
*   personId: antony
*   minDurationMin: 30
*   fixedEnd: true (klart senast 17:00)
*   involved: [{personId:"antony", role:"required"}]
*   resource: kitchen, location: home
*   cluster: Middag

**B) “Äta middag” (Antony, Leia, Gabriel)**
*   title: Middag
*   personId: antony (äger)
*   minDurationMin: 20
*   dependsOn: [“Laga mat”]
*   involved: required = {antony}, helpers = {leia, gabriel} eller alla required om ni vill
*   fixedStart? (om ni vill hålla exakt tid)
*   cluster: Middag

---

## 9) “Varför blockerad?” (whyBlocked) – tydliga etiketter
Visa alltid liten badge om start inte är möjlig:
*   “Väntar på: **Frukost**” (beroende ej klart)
*   “Väntar på: **Badrum**” (resurs upptagen)
*   “Väntar på: **Maria**” (nödvändig person upptagen)

---
*Detta dokument ska uppdateras kontinuerligt allt eftersom stegen i planen slutförs.*