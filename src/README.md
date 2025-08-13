# VisuCal - En AI-assisterad Visuell Kalender

Detta är ett Next.js-projekt skapat i Firebase Studio. Applikationen är en visuell kalender designad för att hjälpa familjer, särskilt de med NPF-utmaningar, att skapa och följa dagliga rutiner med hjälp av AI.

## Kärnkoncept

Applikationen bygger på några centrala idéer:

1.  **Mallbaserade Dagar:** Istället för att skapa enskilda händelser för hand, genereras varje dag från en mall (`TemplateStep`). Detta säkerställer återkommande och förutsägbara rutiner.
2.  **Dagstyper (`DayType`):** Varje dag klassificeras som en viss typ (t.ex. `SchoolDay`, `OffDay`, `FritidsDay`). Vilken mall som används beror på dagstypen. Systemet kan automatiskt avgöra dagstyp baserat på veckodag, lov eller manuella undantag.
3.  **Dynamisk Expansion:** Dagens schema ("instansen") skapas dynamiskt genom att "expandera" mallen för den aktuella dagen. Detta gör att mallen förblir oförändrad medan dagens schema kan justeras (t.ex. vid förseningar).
4.  **AI-assistent:** Appen har en inbyggd AI-assistent som hjälper till med att tolka naturligt språk för att skapa, ändra eller svara på frågor om kalendern.

För en extremt detaljerad teknisk plan, inklusive Google Calendar-synkroniseringsstrategi, se [PLAN.md](/PLAN.md) i projektets rotmapp.

## Arkitektur & Teknik

-   **Frontend:** Byggd med [Next.js](https://nextjs.org/) (App Router) och [React](https://react.dev/).
-   **UI-komponenter:** Använder [ShadCN/UI](https://ui.shadcn.com/) för ett modernt och tillgängligt gränssnitt.
-   **Styling:** [Tailwind CSS](https://tailwindcss.com/) används för all styling.
-   **AI & Generativ Logik:** [Genkit](https://firebase.google.com/docs/genkit) (ett AI-ramverk från Google) används för att definiera och köra alla AI-flöden.

## Filstruktur - Viktiga Filer

För att förstå projektet är det bäst att börja med följande filer och mappar:

-   `src/app/page.tsx`: Huvudsidan och applikationens primära startpunkt. Här hanteras det övergripande tillståndet (state) för händelser, personer och användarinteraktioner.

-   `src/lib/recurrence.ts`: **HJÄRTAT I APPEN.** Denna fil innehåller all logik för den återkommande schemaläggningen.
    -   Definitioner för mallar (`TemplateStep`).
    -   Regler (`RULES`) för att avgöra dagstyp.
    -   Logiken för att expandera en mall till en dags kompletta händelselista (`Event[]`).

-   `src/lib/grid-utils.ts`: Innehåller hjälpfunktioner specifikt för att bygga och hantera det visuella rutnätet. Här finns logik för att:
    -   Bygga rader (`buildRows`).
    -   Applicera `overrides` från användarinteraktioner (som "Klar sent").
    -   Fylla ut luckor i schemat med syntetiska händelser som "Sover" eller "Tillgänglig" (`synthesizeDayFill`).

-   `src/types/event.ts`: Definerar de centrala TypeScript-typerna som används i hela applikationen, såsom `Event`, `Person`, `DayType`, `TemplateStep` och alla AI-relaterade in- och utdataformat.

-   `src/components/calendar/`: Denna mapp innehåller alla React-komponenter som bygger upp kalendervyn:
    -   `CalendarGrid.tsx`: Huvudkomponenten för rutnätet som visar alla händelser.
    -   `GridCell.tsx`: Representerar en enskild cell i rutnätet. Innehåller logik för att visa rätt information och knappar baserat på tid och status.
    -   `AssistantPanel.tsx`: UI för AI-assistenten.
    -   `EditEventSheet.tsx`: Panelen för att redigera enskilda händelser.

-   `src/ai/`: Denna mapp innehåller all AI-relaterad kod.
    -   `src/ai/flows/`: Innehåller de olika AI-flödena som definierats med Genkit. Varje fil representerar en specifik AI-agent (t.ex. `natural-language-event-creation.ts` för Tolk-AI:n eller `generate-event-image.ts` för Bildskapar-AI:n).
    -   `src/ai/schemas.ts`: Definerar datastrukturerna (med Zod) som AI-flödena använder för input och output, vilket garanterar typsäkerhet mellan frontend och AI-backend.

## Komma Igång

För att starta utvecklingsservern, kör:

```bash
npm run dev
```

Detta startar applikationen på `http://localhost:9002`.
