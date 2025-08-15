
"use client";
import React from 'react';
import { motion } from "framer-motion";
import { Image as ImageIcon, CheckCircle, Clock, Settings, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Event, Person, Row } from "@/types/event";
import { plannedEndMsForEvent, getSourceEventForCell, presentTitleForCell, whyBlocked } from '@/lib/grid-utils';
import ProgressTrack from '../ProgressTrackRtl';

const iconFor = (title: string) => {
    const activityIcon: Array<[RegExp, string]> = [
      [/\bSover\b/i, "😴"],
      [/\bMorgonrutin\b/i, "☀️"],
      [/\bBorsta tänder\b/i, "🦷"],
      [/\bBorsta hår\b/i, "💇"],
      [/\bFrukost|Äta/i, "🥣"],
      [/\bVitaminer/i, "💊"],
      [/\bKlä på/i, "👕"],
      [/\bPacka/i, "🎒"],
      [/\bJobb|Arbete/i, "💻"],
      [/\bSkola|Förskola/i, "🏫"],
      [/\bFritids/i, "🧩"],
      [/\bHämtar|Blir hämtad/i, "🚗"],
      [/\bMiddag/i, "🍽️"],
      [/\bKvällsrutin/i, "🌙"],
      [/\bTillgänglig/i, "✅"],
      [/\bLego|Spel|Lek/i, "🎲"]
    ];
    for (const [re, ico] of activityIcon) if (re.test(title)) return ico;
    return "📌";
};


interface GridCellProps {
    person: Person;
    row: Row;
    rIdx: number;
    nowMs: number;
    centerIndex: number;
    currentRowIndex: number;
    startIndex: number;
    allEvents: Event[];
    allPeople: Person[];
    completedUpTo?: number;
    showMeta: boolean;
    onKlar: (id: string | null) => void;
    onKlarSent: (id: string | null) => void;
    onEdit: (event: Event | null) => void;
    onGenerateImage: (event: Event) => void;
    onDelete: (id: string) => void;
}

export function GridCell({
    person,
    row,
    rIdx,
    nowMs,
    centerIndex,
    currentRowIndex,
    startIndex,
    allEvents,
    allPeople,
    completedUpTo,
    showMeta,
    onKlar,
    onKlarSent,
    onEdit,
    onGenerateImage,
    onDelete
}: GridCellProps) {
    const isCenterRow = (startIndex + rIdx) === currentRowIndex;
    const isPastRow = (startIndex + rIdx) < currentRowIndex;
    const sourceEv = getSourceEventForCell(person.id, row, allEvents);
    
    const blockedReason = sourceEv ? whyBlocked(sourceEv, row.time, allEvents, allPeople) : null;
    
    const { title, repeat, sourceEventId } = presentTitleForCell(person.id, row, allEvents, isPastRow, completedUpTo, blockedReason);

    const timeLabel = row.cells.has(person.id) ? new Date(row.time).toLocaleTimeString("sv-SE", { hour: '2-digit', minute: '2-digit' }) : `(${new Date(row.time).toLocaleTimeString("sv-SE", { hour: '2-digit', minute: '2-digit' })})`;
    const ico = iconFor(title);

    const metaBadges: string[] = [];
    if (showMeta && sourceEv) {
        if (sourceEv.fixedStart) metaBadges.push("FixStart");
        if (typeof sourceEv.minDurationMin === "number") metaBadges.push(`min:${sourceEv.minDurationMin}m`);
        if (sourceEv.dependsOn?.length) metaBadges.push(`dep:${sourceEv.dependsOn.length}`);
        if (sourceEv.involved?.length) {
            const req = sourceEv.involved.filter(i => i.role === "required").length;
            const hlp = sourceEv.involved.length - req;
            metaBadges.push(`inv:${req}${hlp ? `+${hlp}h` : ""}`);
        }
        if (sourceEv.allowAlone === true) metaBadges.push("självOK");
        if (sourceEv.resource) metaBadges.push(`res:${sourceEv.resource}`);
        if (sourceEv.location) metaBadges.push(`loc:${sourceEv.location}`);
        if (sourceEv.cluster) metaBadges.push(`cluster:${sourceEv.cluster}`);
    }

    const plannedEnd = sourceEv ? plannedEndMsForEvent(sourceEv, allEvents) : null;
    const isOverdue = !!(sourceEv && plannedEnd && nowMs > plannedEnd && (!completedUpTo || completedUpTo < plannedEnd));
    
    const { current, next } = (() => {
        let current: Event | null = null;
        let next: Event | null = null;
        const personEvents = allEvents.filter(e => e.personId === person.id).sort((a,b) => +new Date(a.start) - +new Date(b.start));
        for (let i = 0; i < personEvents.length; i++) {
          const s = +new Date(personEvents[i].start);
          const e = +new Date(personEvents[i].end);
          if (s <= nowMs && nowMs < e) { current = personEvents[i]; next = personEvents[i+1] ?? null; break; }
          if (nowMs < s && !current) { next = personEvents[i]; break; }
        }
        return { current, next };
    })();
    const showProgress = isCenterRow && current && next;

    return (
        <motion.div layout="position" transition={{ duration: 0.12 }} className={cn(
            "relative flex flex-col justify-end text-white overflow-hidden",
            "border-b border-r border-neutral-800 last:border-r-0 group/row",
            isCenterRow ? "bg-neutral-900/40 min-h-[240px]" : "bg-neutral-950 min-h-[160px]",
            isCenterRow && person.id === 'leia' && "ring-4 ring-yellow-400 z-20" // EXAMPLE: Add yellow ring for Leia in center row
        )}>
            {isCenterRow && <div className="absolute inset-0 border-y-2 border-fuchsia-500/80 pointer-events-none z-10" />}

            {/* Background Image or Gradient */}
            <div className="absolute inset-0">
                {sourceEv && sourceEv.imageUrl ? (
                     <img src={sourceEv.imageUrl} alt={title} className="w-full h-full object-cover" />
                ) : (
                    <div className={cn("w-full h-full grid place-items-center text-5xl", person.bg.replace('bg-','bg-gradient-to-br from-').replace('/40', '/70 via-neutral-900 to-neutral-900'))}>{ico}</div>
                )}
            </div>

            {showProgress && current && next && (
                <ProgressTrack
                    startMs={+new Date(current.start)}
                    targetMs={next ? +new Date(next.start) : +new Date(current.end)}
                    nowMs={nowMs}
                    minDurationMs={(current.minDurationMin ?? 0) * 60000}
                    direction="vertical"
                    variant="overlay"
                    className="absolute inset-0 z-10"
                />
            )}

            {/* Content Overlay */}
            <div className="relative z-20 flex flex-col justify-end h-full p-2 bg-gradient-to-t from-black/80 via-black/50 to-transparent">
                <div className="flex-grow">
                     {/* Meta Badges - Top Right */}
                     {showMeta && sourceEv && (
                        <div className="flex flex-wrap gap-1 mt-1 justify-end">
                            {metaBadges.map((b, i) => (
                                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md border border-white/20 bg-black/40 text-white/90">{b}</span>
                            ))}
                        </div>
                    )}
                </div>
               
                <div>
                     {/* Progress Bar */}
                    <div className={`text-[11px] mb-0.5 font-medium ${isPastRow ? "text-neutral-400" : "text-neutral-300"}`}>
                        {timeLabel}
                    </div>
                    <div className="truncate text-base font-semibold" style={{textShadow: '1px 1px 3px rgba(0,0,0,0.7)'}}>
                        {title}
                        {repeat && <span className="ml-1.5 text-[10px] text-white/70 align-middle">↻</span>}
                    </div>
                     {isOverdue && (
                        <span className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500 bg-amber-900/60 text-amber-200 font-medium">
                           ! Ej klar
                        </span>
                    )}

                    {sourceEventId && isCenterRow && (
                        <div className="flex gap-2 mt-2">
                            <button
                                className="px-2.5 py-1 rounded-md text-xs border border-white/20 bg-black/30 backdrop-blur-sm hover:bg-white/20 flex items-center gap-1.5"
                                onClick={() => onKlar(sourceEventId)}
                            >
                               <CheckCircle size={14}/> Klar
                            </button>

                            <button
                                className={cn("px-2.5 py-1 rounded-md text-xs border flex items-center gap-1.5 backdrop-blur-sm", isOverdue ? 'border-rose-500/80 bg-rose-900/50 hover:bg-rose-900/80' : 'border-white/10 bg-black/20 text-neutral-500 cursor-not-allowed')}
                                onClick={() => isOverdue && onKlarSent(sourceEventId)}
                                disabled={!isOverdue}
                                title={isOverdue ? 'Markera som sent och krymp framåt' : 'Kan bara användas när planerat slut har passerats'}
                            >
                                <Clock size={14}/> Klar sent
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Buttons Overlay */}
            <div className="absolute inset-0 z-30 flex items-center justify-center">
                {sourceEv && !sourceEv.imageUrl && !sourceEv.meta?.synthetic && (
                    <button onClick={() => onGenerateImage(sourceEv)} className="flex items-center justify-center text-white bg-black/40 hover:bg-black/60 p-2 rounded-md transition-colors text-sm">
                        <ImageIcon size={16} /> <span className="ml-2">Skapa bild</span>
                    </button>
                )}
            </div>
            
            {sourceEv && !sourceEv.meta?.synthetic && (
                <>
                    <button 
                        onClick={() => onEdit(sourceEv)} 
                        className="absolute top-2 right-2 w-7 h-7 bg-black/30 text-white/70 rounded-full flex items-center justify-center hover:bg-white/20 hover:text-white z-40"
                        title="Redigera händelse"
                    >
                        <Settings size={14}/>
                    </button>
                    <button 
                        onClick={() => onDelete(sourceEv.id)} 
                        className="absolute bottom-2 right-2 w-7 h-7 bg-black/30 text-white/70 rounded-full flex items-center justify-center hover:bg-rose-900/50 hover:text-white z-40"
                        title="Ta bort händelse"
                    >
                        <Trash2 size={14}/>
                    </button>
                </>
            )}
        </motion.div>
    );
}
