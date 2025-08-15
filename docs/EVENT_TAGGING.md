# Event Tagging Overview

This document summarizes how calendar events are tagged in the current prototype and outlines the architecture changes needed to support richer tagging for future solvers. It is meant for AI systems or developers who need a quick understanding without reading the whole codebase.

## Existing tags

Events are defined in [`src/types/event.ts`](../src/types/event.ts) and carry a mix of required fields and optional metadata:

| Field | Purpose |
| ----- | ------- |
| `personId` | Owner of the event. Used to build one timeline per person. |
| `minDurationMin` | Minimum allowed length when replanning. |
| `fixedStart`, `fixedEnd` | Hard start/end constraints. |
| `dependsOn` | Array of event ids that must finish before this event can start. |
| `involved` | Other people and their role (`required` or `helper`). |
| `resource` | Shared resource identifier such as `bathroom` or `car`. |
| `location` | Free‑text place; checked by `whyBlocked()` against the person’s current location. |
| `cluster` | Routine group like `morning`, `day`, or `evening`. |
| `meta.templateKey` | Link back to the recurring template that generated the event. |
| `meta.dayType` | Classification (`SchoolDay` \| `OffDay` \| `FritidsDay`). |

These tags are mostly plain strings. `grid-utils.ts` interprets them to explain blocks (`whyBlocked`), generate synthetic filler events and apply the “klar sent” heuristic.

## Gaps & next steps

To enable more advanced planners (e.g. a CP‑SAT solver) we need clearer, enumerable tags and additional metadata:

- **Parallel groups** – allow multiple steps to run simultaneously when resources permit.
- **Attention units** – specify how much focus a person must contribute (0.5 for supervision, 1.0 for full attention). Needed to verify that a single parent is not double‑booked.
- **Resource catalog** – replace free‑text `resource` with a defined list that includes capacity numbers.
- **Location catalog** – normalise locations to identifiers and track travel times between them.
- **Soft preferences** – store weights such as ideal start, plan stability or preferred helper.
- **Tag registry** – centralise tag definitions to avoid typos (`src/lib/tag-registry.ts` proposed).

## Proposed architecture changes

1. **Introduce TagRegistry** – an enum‑like module defining allowed `resource`, `location`, `cluster`, and `dayType` values.
2. **Extend `Event` interface** – add `attention` and `parallelGroup` fields plus `softPrefs` for weights.
3. **Normalize inputs** – update parsing flows and UI forms to map natural language or user selections to registry IDs.
4. **Upgrade `grid-utils`** – consume the new fields when computing `whyBlocked()` and when previewing replans.
5. **Prepare for solver** – ensure each event can be serialised into a solver‑friendly structure (intervals with resource and attention requirements).

Standardising tags in this way will make it easier for downstream AI or optimisation modules to reason about the schedule and propose valid changes.

