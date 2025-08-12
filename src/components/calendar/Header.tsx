
"use client";

import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Calendar as CalendarIcon, Settings, ChevronLeft, ChevronRight } from "lucide-react";

function MoonToggle({ dark, setDark }: { dark: boolean; setDark: (dark: boolean) => void; }) { 
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <span className="opacity-70">Mörkt läge</span>
      <Switch checked={dark} onCheckedChange={setDark} />
    </label>
  ); 
}

interface HeaderProps {
  date: Date;
  shiftDate: (days: number) => void;
  setDate: (date: Date) => void;
  dark: boolean;
  setDark: (dark: boolean) => void;
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean) => void;
}

export function Header({ date, shiftDate, setDate, dark, setDark, assistantOpen, setAssistantOpen }: HeaderProps) {
  const dstr = date.toLocaleDateString("sv-SE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return (
    <header className="sticky top-0 z-40 bg-neutral-950/80 backdrop-blur border-b border-neutral-800">
      <div className="max-w-[1600px] mx-auto flex items-center gap-2 p-3 md:p-4">
        <CalendarIcon className="w-6 h-6" />
        <h1 className="font-semibold tracking-tight">VisuCal</h1>
        <div className="mx-2 opacity-60 hidden sm:block">{dstr}</div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="icon" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700" onClick={() => shiftDate(-1)}><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="icon" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700" onClick={() => shiftDate(1)}><ChevronRight className="w-4 h-4" /></Button>
          <Button size="sm" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700 hidden sm:flex" onClick={() => setDate(new Date())}>Idag</Button>
          <div className="flex items-center gap-3 ml-2">
            <MoonToggle dark={dark} setDark={setDark} />
            <Button size="sm" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700" onClick={() => setAssistantOpen(!assistantOpen)}>Assistent</Button>
            <Dialog>
              <DialogTrigger asChild><Button size="icon" variant="secondary" className="bg-neutral-800 hover:bg-neutral-700"><Settings className="w-4 h-4" /></Button></DialogTrigger>
              <DialogContent className="bg-neutral-900 text-neutral-100 border-neutral-700">
                <DialogHeader><DialogTitle>Inställningar & Labb</DialogTitle></DialogHeader>
                <div className="space-y-3 text-sm">
                  <p className="text-neutral-400">Här kommer inställningar för Kalenderassistenten.</p>
                  <div className="pt-4 border-t border-neutral-800 mt-4">
                    <h4 className="font-semibold text-neutral-200 mb-2">Länkar till labbsidor</h4>
                    <ul className="list-disc list-inside space-y-1 text-neutral-300">
                      <li><a href="/lab/sim" className="underline text-primary/90 hover:text-primary">Labbsida: Simulerad Tid + Grid</a></li>
                      <li><a href="/lab/rtl-progress" className="underline text-primary/90 hover:text-primary">Labbsida: RTL Progress-test</a></li>
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </header>
  );
}
