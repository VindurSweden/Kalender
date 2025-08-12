
"use client";
import React from 'react';
import { motion } from "framer-motion";
import { Image as ImageIcon, Trash2, CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Event, Person, Row } from "@/types/event";
import { whyBlocked, plannedEndMsForEvent, getSourceEventForCell, presentTitleForCell } from '@/lib/grid-utils';
import ProgressTrackRtl from '../ProgressTrackRtl';

const HHMM = (msOrDate: number | Date) => {
    const d = typeof msOrDate === "number" ? new Date(msOrDate) : msOrDate;
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

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
    completedUpTo?: number;
    showMeta: boolean;
    onKlar: (id: string | null) => void;
    onKlarSent: (id: string | null) => void;
    onDelete: (id: string) => void;
    onGenerateImage: (event: Event) => void;
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
    completedUpTo,
    showMeta,
    onKlar,
    onKlarSent,
    onDelete,
    onGenerateImage
}: GridCellProps) {
    const isCenterRow = rIdx === centerIndex;
    const isPastRow = (startIndex + rIdx) < currentRowIndex;

    const { title, repeat, sourceEventId } = presentTitleForCell(person.id, row, allEvents, isPastRow, completedUpTo);
    const sourceEv = getSourceEventForCell(person.id, row, allEvents);
    const timeLabel = row.cells.has(person.id) ? HHMM(row.time) : `(${HHMM(row.time)})`;
    const ico = iconFor(title);

    const metaBadges: string[] = [];
    if (sourceEv) {
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
    
    // Progress bar logic
    const { current, next } = (() => {
        let current: Event | null = null;
        let next: Event | null = null;
        for (let i = 0; i < allEvents.length; i++) {
          if (allEvents[i].personId !== person.id) continue;
          const s = +new Date(allEvents[i].start);
          const e = +new Date(allEvents[i].end);
          if (s <= nowMs && nowMs < e) { current = allEvents[i]; next = allEvents.find((e, idx) => idx > i && e.personId === person.id) ?? null; break; }
          if (nowMs < s) { next = allEvents[i]; break; }
        }
        return { current, next };
    })();
    const showProgress = isCenterRow && current && next;

    return (
        <div className={cn(
            "relative px-2 py-2 flex flex-col justify-center gap-1 border-b border-r border-neutral-800 last:border-r-0",
            isCenterRow ? "bg-neutral-900/40" : "bg-neutral-950",
            sourceEv?.meta?.synthetic ? "border-dashed" : ""
        )}>
            {isCenterRow && <div className="absolute inset-0 border-y border-fuchsia-500/40 bg-fuchsia-500/5 pointer-events-none" />}

            <div className="flex items-center gap-3">
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 grid place-items-center shrink-0 relative group/image">
                    {sourceEv && sourceEv.imageUrl ? (
                         <img src={sourceEv.imageUrl} alt={title} className="w-full h-full object-cover rounded-xl" />
                    ) : (
                        <div className={cn("w-full h-full rounded-xl grid place-items-center text-2xl", person.bg.replace('bg-','bg-gradient-to-br from-').replace('/40', '/70 via-neutral-900 to-neutral-900'))}>{ico}</div>
                    )}
                     {sourceEv && !sourceEv.imageUrl && !sourceEv.meta?.synthetic && (
                        <button onClick={() => onGenerateImage(sourceEv)} className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center text-white opacity-0 group-hover/image:opacity-100 transition-opacity">
                            <ImageIcon size={20} />
                        </button>
                    )}
                </div>

                <div className="min-w-0 flex-grow">
                    <div className={`text-[11px] mb-0.5 ${isPastRow ? "text-neutral-500" : "text-neutral-400"}`}>
                        {timeLabel}
                    </div>
                    <div className="truncate text-sm font-medium">
                        {title}
                        {repeat && <span className="ml-1 text-[10px] text-neutral-400 align-middle">↻</span>}
                    </div>
                     {isOverdue && (
                        <span className="mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded-md border border-amber-600 bg-amber-900/30 text-amber-200">
                            Ej klar ännu
                        </span>
                    )}
                </div>
            </div>

            {showMeta && sourceEv && (
                <div className="flex flex-wrap gap-1 mt-1">
                    {metaBadges.map((b, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md border border-neutral-700 bg-neutral-900/60 text-neutral-300">{b}</span>
                    ))}
                </div>
            )}
            
            {showProgress && current && next && (
                <ProgressTrackRtl
                    startMs={+new Date(current.start)}
                    targetMs={+new Date(next.start)}
                    nowMs={nowMs}
                    minDurationMs={(current.minDurationMin ?? 0) * 60000}
                />
            )}
            
            {sourceEventId && isCenterRow && !sourceEv?.meta?.synthetic && (
                <div className="flex gap-2 mt-1">
                    <button
                        className="px-2 py-0.5 rounded-md text-xs border border-neutral-700 bg-neutral-900 flex items-center gap-1"
                        onClick={() => onKlar(sourceEventId)}
                    >
                       <CheckCircle size={12}/> Klar
                    </button>

                    <button
                        className={cn("px-2 py-0.5 rounded-md text-xs border flex items-center gap-1", isOverdue ? 'border-rose-700 bg-rose-900/30' : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 cursor-not-allowed')}
                        onClick={() => isOverdue && onKlarSent(sourceEventId)}
                        disabled={!isOverdue}
                        aria-disabled={!isOverdue}
                        title={isOverdue ? 'Markera som sent och krymp framåt' : 'Kan bara användas när planerat slut har passerats'}
                    >
                        <Clock size={12}/> Klar sent
                    </button>
                </div>
            )}
            {sourceEventId && !sourceEv?.meta?.synthetic && <button onClick={() => onDelete(sourceEventId)} className="absolute top-1 right-1 w-6 h-6 bg-black/20 text-white/70 rounded-full flex items-center justify-center hover:bg-black/50 opacity-50 hover:opacity-100"><Trash2 size={12}/></button>}
        </div>
    );
}
