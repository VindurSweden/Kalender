
"use client";
import React, { useMemo } from 'react';
import { motion, useAnimation } from "framer-motion";
import { Image as ImageIcon, CheckCircle, Clock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Event, Person, Row } from "@/types/event";
import { plannedEndMsForEvent, getSourceEventForCell, presentTitleForCell, whyBlocked } from '@/lib/grid-utils';
import { buildOverlayBackground, clamp01 } from './overlayTopDown';
import { speedEmojiByTotal } from '@/lib/progress';

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
    
    const progressData = useMemo(() => {
        if (!isCenterRow || !sourceEv || sourceEv.meta?.synthetic) return null;
        const start = +new Date(sourceEv.start);
        const end = plannedEndMsForEvent(sourceEv, allEvents);
        const totalMs = end - start;
        if (totalMs <= 0) return null;
    
        const progress = clamp01((nowMs - start) / totalMs);
        
        const minMs = (sourceEv.minDurationMin ?? 0) * 60000;
        const warnStart = minMs > 0 ? clamp01(1 - (minMs / totalMs)) : 1.0;
        const emoji = speedEmojiByTotal(totalMs);

        const overlayParams = { warnStart, alphaElapsed: 0.32, alphaSafe: 0.09, alphaWarnTop: 0.15, alphaWarnBottom: 0.23, alphaOverdueBoost: 0.14, warnHue: 0 };
        const overlay = buildOverlayBackground(progress, overlayParams, { liftDark: 0 });

        return { progress, overlay, emoji };
    }, [isCenterRow, sourceEv, nowMs, allEvents]);

    
    const controls = useAnimation();
    const isPastMidpoint = progressData && progressData.progress > 0.5;

    React.useEffect(() => {
        controls.start({
            justifyContent: isPastMidpoint ? 'flex-start' : 'flex-end',
        });
    }, [isPastMidpoint, controls]);


    const height = isCenterRow ? 240 : 160;

    return (
        <motion.div 
            layout="position"
            transition={{ layout: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
            initial={false}
            animate={{ height }}
            className={cn(
            "relative flex flex-col justify-end text-white overflow-hidden",
            "border-b border-r border-neutral-800 last:border-r-0 group/row"
        )}>
            
            {/* Background Image or Gradient */}
            <div className="absolute inset-0">
                {sourceEv && sourceEv.imageUrl ? (
                     <img src={sourceEv.imageUrl} alt={title} className="w-full h-full object-cover" />
                ) : (
                    <div className={cn("w-full h-full grid place-items-center text-5xl", person.bg.replace('bg-','bg-gradient-to-br from-').replace('/40', '/70 via-neutral-900 to-neutral-900'))}>{ico}</div>
                )}
            </div>

            {/* New Overlay */}
            {progressData?.overlay && <div className="absolute inset-0 z-10" style={progressData.overlay.style} />}
            {progressData && (
                <div className="absolute left-1 z-20" style={{ top: `calc(${progressData.progress * 100}% - 10px)` }}>{progressData.emoji}</div>
            )}
            
            {/* Content Overlay */}
            <motion.div layout animate={controls} className="relative z-20 flex flex-col h-full p-2 bg-gradient-to-t from-black/80 via-black/50 to-transparent">
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
                                className="px-2.5 py-1 rounded-md text-xs border flex items-center gap-1.5 backdrop-blur-sm border-white/20 bg-black/30 hover:bg-white/20"
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
            </motion.div>

            {/* Buttons Overlay */}
            <div className="absolute inset-0 z-30 flex items-center justify-center">
                {sourceEv && !sourceEv.imageUrl && !sourceEv.meta?.synthetic && (
                    <button onClick={() => onGenerateImage(sourceEv)} className="flex items-center justify-center text-white bg-black/40 hover:bg-black/60 p-2 rounded-md transition-colors text-sm">
                        <ImageIcon size={16} /> <span className="ml-2">Skapa bild</span>
                    </button>
                )}
            </div>
            
            {sourceEv && !sourceEv.meta?.synthetic && (
                <button 
                    onClick={() => onEdit(sourceEv)} 
                    className="absolute top-2 right-2 w-7 h-7 bg-black/30 text-white/70 rounded-full flex items-center justify-center hover:bg-white/20 hover:text-white z-40"
                    title="Redigera händelse"
                >
                    <Settings size={14}/>
                </button>
            )}
        </motion.div>
    );
}

    