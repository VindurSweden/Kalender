
"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Event, Person, Row, Override } from "@/types/event";
import { buildRows, applyOverrides, synthesizeDayFill, previewReplanProportional } from "@/lib/grid-utils";
import { GridCell } from './GridCell';
import { Edit } from "lucide-react";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

const SLOTS = 5;

interface CalendarGridProps {
    people: Person[];
    events: Event[];
    onEventUpdate: (event: Partial<Event>) => void;
    onEdit: (event: Event | null) => void;
    onGenerateImage: (event: Event) => void;
    onKlar: (id: string | null) => void;
    onKlarSent: (id: string | null) => void;
    onDelete: (id: string) => void;
}

export function CalendarGrid({ people, events, onEventUpdate, onEdit, onGenerateImage, onKlar, onKlarSent, onDelete }: CalendarGridProps) {
    const [nowMs, setNowMs] = useState<number>(() => Date.now());
    const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
    const [completedUpTo, setCompletedUpTo] = useState<Map<string, number>>(new Map());
    const [showMeta, setShowMeta] = useState(false);
    const [flash, setFlash] = useState<null | { kind: "klar" | "late"; at: number }>(null);
    const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        const timerId = setInterval(() => {
            setNowMs(Date.now());
        }, 1000); // Update every second for a live clock
        return () => clearInterval(timerId);
    }, []);

    // Effect to resolve gs:// URLs to https:// URLs
    useEffect(() => {
        const fetchImageUrls = async () => {
            const urlsToFetch = events.filter(event => 
                event.imageUrl && 
                event.imageUrl.startsWith('gs://') && 
                !imageUrls[event.id] // Only fetch if not already in state
            );

            if (urlsToFetch.length === 0) return;

            const newUrls: Record<string, string> = {};
            const promises = urlsToFetch.map(async (event) => {
                try {
                    const url = await getDownloadURL(ref(storage, event.imageUrl!));
                    newUrls[event.id] = url;
                } catch (error) {
                    console.error(`Error fetching image URL for event ${event.id}:`, error);
                }
            });

            await Promise.all(promises);

            if (Object.keys(newUrls).length > 0) {
                setImageUrls(prev => ({ ...prev, ...newUrls }));
            }
        };

        fetchImageUrls();
    }, [events, imageUrls]);

    const eventsWithImages = useMemo(() => {
        return events.map(event => {
            // Priority:
            // 1. Resolved https URL from state (imageUrls)
            // 2. data: URI (for optimistic updates)
            // 3. The original imageUrl from the event object (could be gs://)
            const resolvedUrl = imageUrls[event.id];
            const optimisticUrl = event.imageUrl?.startsWith('data:') ? event.imageUrl : undefined;
            return {
                ...event,
                imageUrl: resolvedUrl || optimisticUrl || event.imageUrl,
            };
        });
    }, [events, imageUrls]);
    
    const filledEvents = useMemo(() => {
        let allFilled: Event[] = [];
        for (const p of people) {
            const personEvents = eventsWithImages.filter(e => e.personId === p.id);
            const filled = synthesizeDayFill(personEvents, p.id, new Date(nowMs));
            allFilled.push(...filled);
        }
        return allFilled;
    }, [eventsWithImages, people, nowMs]);
    
    const visEvents = useMemo(() => applyOverrides(filledEvents, overrides), [filledEvents, overrides]);
    const rows = useMemo(() => buildRows(visEvents, people), [visEvents, people]);

    const currentRowIndex = useMemo(() => {
        const idx = rows.findIndex(r => r.time > nowMs);
        if (idx === -1) return rows.length > 0 ? rows.length - 1 : 0;
        return Math.max(0, idx - 1);
    }, [rows, nowMs]);
    
    const centerIndex = Math.floor(SLOTS / 2);
    const startIndex = clamp(currentRowIndex - centerIndex, 0, Math.max(0, rows.length - SLOTS));
    const visibleRows = rows.slice(startIndex, startIndex + SLOTS);

    function setPersonCompleted(pId: string, upToMs: number) {
        setCompletedUpTo(prev => {
          const m = new Map(prev);
          m.set(pId, Math.max(upToMs, m.get(pId) ?? 0));
          return m;
        });
    }

    function handleLocalKlar(eventId: string | null) {
        if (!eventId) return;
        const ev = visEvents.find(e => e.id === eventId);
        if (!ev) return;
        setPersonCompleted(ev.personId, nowMs);
        setFlash({ kind: "klar", at: Date.now() });
        setTimeout(() => setFlash(null), 800);
        onKlar(eventId);
    }
  
    function handleLocalKlarSent(eventId: string | null) {
      if (!eventId) return;
      const preview = previewReplanProportional(eventId, nowMs, visEvents);
  
      if ("patches" in preview) {
        setOverrides(prev => {
          const map = new Map(prev);
          for (const p of preview.patches) {
            const o = map.get(p.eventId) ?? {};
            o.startMs = p.newStartMs;
            if (p.newPlannedMs != null) o.plannedMs = p.newPlannedMs;
            map.set(p.eventId, o);
          }
          return map;
        });
      }
  
      const seed = visEvents.find(e => e.id === eventId);
      if (seed) setPersonCompleted(seed.personId, nowMs);
  
      if (preview.status === "insufficientFlex") {
        console.warn("Insufficient flex", {
          missingMin: Math.round((preview as any).missingMs/60000),
        });
      }
      setFlash({ kind: "late", at: Date.now() });
      setTimeout(() => setFlash(null), 1200);
      onKlarSent(eventId);
    }

    return (
        <div>
            {/* Controls */}
             <div className="mb-3 flex flex-wrap gap-2 items-center text-xs text-neutral-300">
                 <label className="flex items-center gap-2">
                    <input type="checkbox" checked={showMeta} onChange={(e) => setShowMeta(e.target.checked)} /> Visa metadata
                </label>
            </div>

            {/* Grid */}
            <div className="rounded-2xl overflow-hidden border border-neutral-800">
                {/* Headers */}
                <div className="grid" style={{ gridTemplateColumns: `repeat(${people.length}, minmax(0, 1fr))` }}>
                    {people.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border-b border-neutral-800 border-r last:border-r-0">
                            <div className={`w-7 h-7 rounded-xl bg-gradient-to-br ${p.bg.replace('bg-','from-').replace('/40','/80')} grid place-items-center text-sm`}>{p.emoji}</div>
                            <div className="text-sm font-medium truncate">{p.name}</div>
                        </div>
                    ))}
                </div>

                {/* Rows */}
                <div className="relative grid" style={{ gridTemplateColumns: `repeat(${people.length}, minmax(0, 1fr))`, gridAutoRows: 'min-content' }}>
                   
                    {visibleRows.map((row, rIdx) => (
                        <React.Fragment key={row.time + "-" + rIdx}>
                            {people.map(p => (
                                <GridCell 
                                    key={p.id + "-" + row.time}
                                    person={p}
                                    row={row}
                                    rIdx={rIdx}
                                    nowMs={nowMs}
                                    centerIndex={centerIndex}
                                    currentRowIndex={currentRowIndex}
                                    startIndex={startIndex}
                                    allEvents={visEvents}
                                    allPeople={people}
                                    completedUpTo={completedUpTo.get(p.id)}
                                    showMeta={showMeta}
                                    onKlar={handleLocalKlar}
                                    onKlarSent={handleLocalKlarSent}
                                    onEdit={onEdit}
                                    onGenerateImage={onGenerateImage}
                                    onDelete={onDelete}
                                />
                            ))}
                        </React.Fragment>
                    ))}
                </div>
            </div>
             {flash && (
                <div className="fixed right-4 bottom-4 z-50">
                <AnimatePresence>
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
                        <div className={`px-3 py-2 rounded-lg border ${flash.kind === "klar" ? "border-emerald-400/40 bg-emerald-600/15" : "border-amber-400/40 bg-amber-600/15"}`}>
                        {flash.kind === "klar" ? "✔️ Klart!" : "⏱️ Klar sent – omplanerar..."}
                        </div>
                    </motion.div>
                </AnimatePresence>
                </div>
            )}
        </div>
    );
}
