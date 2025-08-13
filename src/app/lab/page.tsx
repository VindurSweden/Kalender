"use client";
import React from "react";
import {TimeProvider, useNowMs, useTimeControls} from "@/time/TimeSource";
import {EventGrid, GridEvent} from "@/ui/EventGrid";

const today = new Date().toISOString().slice(0,10);
const t = (h:number, m=0) => `${today}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`;

const PEOPLE = [
  {id:"leia", name:"Leia", color:"#F28CB2", emoji:"🧒"},
  {id:"gabriel", name:"Gabriel", color:"#5B9BFF", emoji:"👦"},
  {id:"mamma", name:"Maria", color:"#C9A7FF", emoji:"👩"},
  {id:"family", name:"Familj", color:"#FFD700", emoji:"👪"},
];

const EVENTS: GridEvent[] = [
  {id:"maria-0700", personId:"mamma", title:"Morgonrutin", start:t(7,0), end:t(8,0)},
  {id:"leia-0708", personId:"leia", title:"Borsta tänder", start:t(7,8), end:t(7,16)},
  {id:"gab-0720", personId:"gabriel", title:"Frukost", start:t(7,20), end:t(7,40)},
  {id:"fam-1800", personId:"family", title:"Middag", start:t(18,0), end:t(19,0)},
];

function Controls(){
  const {play,pause,setSpeed,jumpTo,nowMs} = useTimeControls();
  return (
    <div className="flex gap-2 mb-4 flex-wrap">
      <button onClick={play} className="px-2 py-1 border rounded">Play</button>
      <button onClick={pause} className="px-2 py-1 border rounded">Pause</button>
      <select onChange={e=>setSpeed(Number(e.target.value))} className="border rounded px-2">
        <option value={2}>2s/h</option>
        <option value={5}>5s/h</option>
        <option value={10}>10s/h</option>
      </select>
      <button onClick={()=>jumpTo(t(7))} className="px-2 py-1 border rounded">07:00</button>
      <button onClick={()=>jumpTo(t(12))} className="px-2 py-1 border rounded">12:00</button>
      <button onClick={()=>jumpTo(t(18))} className="px-2 py-1 border rounded">18:00</button>
      <div className="ml-auto text-sm">{new Date(nowMs).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</div>
    </div>
  );
}

function LabInner(){
  const nowMs = useNowMs();
  return (
    <>
      <Controls />
      <EventGrid events={EVENTS} people={PEOPLE} nowMs={nowMs} />
    </>
  );
}

export default function LabPage(){
  return (
    <TimeProvider mode="simulated">
      <LabInner />
    </TimeProvider>
  );
}
