# Kalender Code Overview

This document gives a quick tour of the core structures and modules used in the current calendar prototype. It is intended for other AI systems or developers that need a high level understanding without reading the entire codebase.

## Event model

All time slots in the calendar are represented by the `Event` interface located in `src/types/event.ts`.

```ts
export interface Event {
  id: string;                // unique per day
  personId: string;          // owner of the event
  start: string;             // ISO timestamp
  end: string;               // ISO timestamp
  title: string;

  // Optional metadata used by the planner
  minDurationMin?: number;   // shortest acceptable length
  fixedStart?: boolean;      // true if start is locked
  dependsOn?: string[];      // ids that must finish first
  involved?: { personId: string; role: Role }[]; // additional people, role is "required" or "helper"
  resource?: string;         // e.g. car, bathroom
  location?: string;         // free text place
  cluster?: string;          // routine group (morning, evening …)

  // Misc fields used by the UI and templates
  imageUrl?: string;
  challenge?: string;
  meta?: {
    templateKey?: string;    // origin from recurrence template
    dayType?: DayType;       // SchoolDay | OffDay | FritidsDay
    synthetic?: boolean;     // generated filler events
    source?: "user" | "assistant" | "system" | "template";
  };
}
```

Related types include `Person`, `TemplateStep` (recurring step description) and `DayProfile` (set of template steps for a day type).

## Recurring templates

`src/lib/recurrence.ts` holds default day profiles. Each `TemplateStep` describes a routine item such as breakfast or pickup and may reference other steps through `dependsOnKeys`.

At runtime `expandProfileForDate()` converts these templates into concrete `Event` objects for a given date. During this expansion:

- Events are sorted per person and their `end` time is inferred from the start of the next event or the minimum duration.
- `dependsOnKeys` are translated into real event ids in the `dependsOn` field.
- Metadata like `resource`, `location` and `cluster` is copied across.

`classifyDay()` decides which day profile to use (SchoolDay, OffDay, FritidsDay) based on rules such as weekends or explicit overrides.

## Grid utilities and heuristics

`src/lib/grid-utils.ts` provides many helper functions used by the UI:

- **Resource capacities** – `RESOURCES` defines shared resources (car, bathroom) with a simple capacity number.
- **whyBlocked()** – explains why an event cannot start. It checks in order: finish‑to‑start dependencies (`dependsOn`), required people currently busy (`involved` with role required), resource contention, and mismatched locations.
- **synthesizeDayFill()** – generates synthetic "available" or "sleep" events so that each person has a full‑day timeline.
- **buildRows()** – transforms all events into a row/column structure used by the visual grid.
- **previewReplanProportional()** – the current heuristic that shortens later flexible events when a user reports that a step finished late (the "Klar sent" action).

## Calendar grid component

`src/components/calendar/CalendarGrid.tsx` assembles the visual schedule. It:

1. Combines real events with synthetic filler events for each person.
2. Applies local overrides created by the replan heuristic.
3. Builds visible rows for the grid.
4. Renders each cell with `GridCell` which displays metadata badges such as `dep`, `res`, etc.
5. Handles user actions: marking an event "klar", "klar sent", editing or deleting events.

## Current tagging approach

- Every event carries metadata fields (`dependsOn`, `involved`, `resource`, `location`, `cluster`, `minDurationMin`, `fixedStart`).
- Dependencies and resource limits are enforced only in the UI through `whyBlocked()`; the solver backend is not yet implemented.
- Tags originate either from user input, AI parsing or from recurring templates (`meta.templateKey`).

This overview should enable another model to reason about where to insert more advanced scheduling logic (e.g. a CP‑SAT solver) or how to extend tagging (e.g. richer resource definitions, parallel groups, or soft preferences).

