
"use client";

import React from 'react';
import { motion } from "framer-motion";
import { Timer as TimerIcon, Trash2, Play, Repeat, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Event, Person } from '@/types/event';
import { presentTitle } from '@/app/page';


function fmtTime(iso: string | number | undefined) { if (!iso) return ""; try { const d = new Date(iso); return d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } }
function isNowWithin(ev: Event, nowTs: number) { const s = new Date(ev.start).getTime(); const e = new Date(ev.end).getTime(); return nowTs >= s && nowTs <= e; }
function progressForEvent(ev: Event, nowTs: number) { const s = new Date(ev.start).getTime(); const e = new Date(ev.end).getTime(); if (!isFinite(s) || !isFinite(e) || e <= s) return 0; const p = (nowTs - s) / (e - s); return Math.max(0, Math.min(1, p)); }
function remainingTime(ev: Event, nowTs: number) { const e = new Date(ev.end).getTime(); const diff = Math.max(0, e - nowTs); const m = Math.floor(diff / 60000); const s = Math.floor((diff % 60000) / 1000); return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`; }

interface EventCardProps {
  person: Person;
  ev: Event;
  onDelete: (id: string) => void;
  onComplete: (id: string) => void;
  onPickTimer: (id: string | null) => void;
  onGenerate: (event: Event) => void;
  runningId: string | null;
  now: number;
  showSimple: boolean;
  viewConfig: any;
}

export function EventCard({ person, ev, onDelete, onComplete, onPickTimer, onGenerate, runningId, now, showSimple, viewConfig }: EventCardProps) {
  const from = fmtTime(ev.start);
  const to = fmtTime(ev.end);
  const activeNow = isNowWithin(ev, now);
  const p = progressForEvent(ev, now);
  const remaining = remainingTime(ev, now);
  const isTimerRunning = runningId === ev.id;
  const displayTitle = presentTitle(ev, viewConfig);

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="h-full">
      <div className={`group rounded-xl overflow-hidden border bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-white/20 h-full flex flex-col ${activeNow ? "border-amber-500/70" : "border-neutral-800"} ${ev.meta?.synthetic ? "border-dashed border-neutral-700" : ""}`}>
        <div className="relative flex-grow h-40">
          <div className="absolute inset-0 w-full h-full bg-neutral-800" onClick={(e) => {
              if (!ev.imageUrl && !ev.meta?.synthetic) {
                e.stopPropagation();
                onGenerate(ev);
              }
            }}>
            {ev.imageUrl ? <img src={ev.imageUrl} alt={ev.title} className="w-full h-full object-cover" /> :
              <div className="w-full h-full flex items-center justify-center hover:bg-neutral-700 transition-colors">
                {ev.meta?.synthetic ? (
                  <div className="text-neutral-500 text-sm">(Assistentfyllt)</div>
                ) : (
                  <Button size="sm" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700 pointer-events-none">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Skapa bild
                  </Button>
                )}
              </div>
            }
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 flex flex-col justify-end pointer-events-none">
            <div className={`font-semibold text-white ${showSimple ? 'text-base' : 'text-xl'}`} style={{textShadow: '2px 2px 4px rgba(0,0,0,0.8)'}}>
              {displayTitle}
              {ev.meta?.isContinuation && <Repeat className="w-4 h-4 text-white/70 inline-block ml-1" title="Pågående aktivitet" />}
            </div>
          </div>
          {(isTimerRunning || activeNow) && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="rounded-full bg-black/40 p-3 backdrop-blur"><svg width="84" height="84" viewBox="0 0 100 100" className="block"><circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.2)" strokeWidth="8" fill="none" /><circle cx="50" cy="50" r="42" stroke="white" strokeWidth="8" fill="none" strokeDasharray={2 * Math.PI * 42} strokeDashoffset={(1 - p) * (2 * Math.PI * 42)} strokeLinecap="round" /></svg><div className="-mt-16 text-center"><div className="text-xs opacity-80">{activeNow ? "Pågår" : "Timer"}</div><div className="text-lg font-semibold">{remaining}</div></div></div>
            </div>
          )}
        </div>
        <div className="p-3 bg-neutral-900 flex-shrink-0">
          <div className="flex items-center gap-3 text-sm opacity-80">
            <span>{from}–{to}</span>
            {ev.completed && <Badge className="ml-auto bg-green-700/80">Klart</Badge>}
            {ev.isFamily && <Badge className="ml-auto bg-amber-600/80">Familj</Badge>}
          </div>
          {ev.challenge && <div className="text-sm mt-1 opacity-80 px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 inline-block">Utmaning: {ev.challenge}</div>}
          
          {!showSimple && (
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700" onClick={(e) => { e.stopPropagation(); onPickTimer(isTimerRunning ? null : ev.id); }}><TimerIcon className="w-4 h-4 mr-2" />{isTimerRunning ? "Stoppa" : "Starta"} timer</Button>
              <Button size="sm" className="bg-green-700 hover:bg-green-600" onClick={(e) => { e.stopPropagation(); onComplete(ev.id); }}><Play className="w-4 h-4 mr-2" />Markera klart</Button>
            </div>
          )}
          <Button size="icon" variant="secondary" className="ml-auto bg-neutral-800 hover:bg-neutral-700 absolute right-2 bottom-2" onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }}><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    </motion.div>
  );
}
