
"use client";

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Person } from '@/types/event';
import { Mic } from 'lucide-react';

interface ToolbarProps {
  people: Person[];
  showFor: string[];
  setShowFor: (showFor: string[]) => void;
}

export function Toolbar({ people, showFor, setShowFor }: ToolbarProps) {
  return (
    <Card className="bg-neutral-900 border-neutral-800">
      <CardContent className="p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm opacity-70 mr-2">Visa kolumner:</div>
          {people.map((p: Person) => (
            <button key={p.id}
              onClick={() => setShowFor(showFor.includes(p.id) ? showFor.filter(x => x !== p.id) : [...showFor, p.id])}
              className={`px-3 py-1 rounded-full border transition-colors ${showFor.includes(p.id) ? "border-white/60" : "border-white/10"}`}
              style={{ backgroundColor: showFor.includes(p.id) ? `${p.color}33` : "transparent" }}>
              <span className="inline-flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </span>
            </button>
          ))}
          <Button size="sm" variant="secondary" className="ml-auto bg-neutral-800 hover:bg-neutral-700">
            <Mic className="w-4 h-4 mr-2" />Röst (TBD)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
