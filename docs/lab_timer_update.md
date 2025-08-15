# Lab Timer Update

The lab pages now rely on a shared `TimeProvider` (`src/time/TimeSource.tsx`) instead of manual `requestAnimationFrame` loops. This provider simulates time progression and exposes controls for play, pause, speed, and jumps.

## Changes

- `src/app/lab/rtl-progress/page.tsx` and `src/app/lab/sim/page.tsx` wrap their content with `TimeProvider` in `simulated` mode.
- Local UI state for play/pause and speed syncs with the provider via `useTimeControls`.
- When simulated time reaches the end of day the clock resets to start-of-day using `jumpTo`.

## Plan for Main Integration

1. Wrap the main application with `TimeProvider` in `system` mode to expose current real time through the same hook interface.
2. Replace direct `Date.now()` calls in components with `useNowMs`/`useTimeControls` so both real and simulated modes share the same API.
3. Once verified in the lab, allow the main app to toggle between system and simulated modes for testing or demos.

