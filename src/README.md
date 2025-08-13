# VisuCal - En AI-assisterad Visuell Kalender

Detta är ett Next.js-projekt skapat i Firebase Studio. Applikationen är en visuell kalender designad för att hjälpa familjer, särskilt de med NPF-utmaningar, att skapa och följa dagliga rutiner med hjälp av AI.

## Kärnkoncept

Applikationen bygger på några centrala idéer:

1.  **Mallbaserade Dagar:** Istället för att skapa enskilda händelser för hand, genereras varje dag från en mall (`TemplateStep`). Detta säkerställer återkommande och förutsägbara rutiner.
2.  **Dagstyper (`DayType`):** Varje dag klassificeras som en viss typ (t.ex. `SchoolDay`, `OffDay`, `FritidsDay`). Vilken mall som används beror på dagstypen. Systemet kan automatiskt avgöra dagstyp baserat på veckodag, lov eller manuella undantag.
3.  **Dynamisk Expansion:** Dagens schema ("instansen") skapas dynamiskt genom att "expandera" mallen för den aktuella dagen. Detta gör att mallen förblir oförändrad medan dagens schema kan justeras (t.ex. vid förseningar).
4.  **AI-assistent:** Appen har en inbyggd AI-assistent som hjälper till med att tolka naturligt språk för att skapa, ändra eller svara på frågor om kalendern.

För en extremt detaljerad teknisk plan, inklusive Google Calendar-synkroniseringsstrategi, se [PLAN.md](PLAN.md).

## Arkitektur & Teknik

-   **Frontend:** Byggd med [Next.js](https://nextjs.org/) (App Router) och [React](https://react.dev/).
-   **UI-komponenter:** Använder [ShadCN/UI](https://ui.shadcn.com/) för ett modernt och tillgängligt gränssnitt.
-   **Styling:** [Tailwind CSS](https://tailwindcss.com/) används för all styling.
-   **AI & Generativ Logik:** [Genkit](https://firebase.google.com/docs/genkit) (ett AI-ramverk från Google) används för att definiera och köra alla AI-flöden.

## Filstruktur - Viktiga Filer

-   `src/app/page.tsx`: Huvudsidan och applikationens primära startpunkt.
-   `src/lib/recurrence.ts`: **HJÄRTAT I APPEN.** Innehåller definitioner för mallar (`TemplateStep`), regler (`RULES`), och logiken för att expandera en mall till en dags händelselista (`Event[]`).
-   `src/lib/grid-utils.ts`: Hjälpfunktioner specifikt för att bygga och hantera det visuella rutnätet, inklusive logik för omplanering ("Klar sent").
-   `src/types/event.ts`: Centrala TypeScript-typer som används i hela applikationen (`Event`, `Person`, `DayType`, etc.).
-   `src/components/calendar/`: Innehåller UI-komponenterna som bygger upp kalendervyn, t.ex. `CalendarGrid.tsx` och `GridCell.tsx`.
-   `src/ai/`: Mappen för all AI-relaterad kod.
    -   `src/ai/flows/`: Innehåller de olika AI-flödena, t.ex. för att tolka användarinput (`natural-language-event-creation.ts`) eller generera bilder (`generate-event-image.ts`).
    -   `src/ai/schemas.ts`: Definerar datastrukturerna (med Zod) som AI-flödena använder för input och output.

## Komma Igång

För att starta utvecklingsservern, kör:

```bash
npm run dev
```

Detta startar applikationen på `http://localhost:9002`.
