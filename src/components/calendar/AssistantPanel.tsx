
"use client";

import React, { useState, useRef, useEffect, FC } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Bot, User, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { interpretUserInstruction } from '@/ai/flows/natural-language-event-creation';
import { formatPlan } from '@/ai/flows/format-plan-flow';
import type { Event, Person, ConversationMessage, TolkAIInput, TolkAIOutput, FormatPlanOutput, SingleCalendarOperationType } from '@/types/event';
import { format as formatDateFns } from 'date-fns';

const uid = () => Math.random().toString(36).slice(2, 9);
const AI_PROCESS_TIMEOUT = 30000;

async function boom() {
  if (typeof window === 'undefined') return;
  try {
    const confetti = (await import("canvas-confetti")).default;
    confetti({ particleCount: 200, spread: 75, origin: { y: 0.7 } });
  } catch {}
}

interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
  events: Event[];
  people: Person[];
  onAiAction: (op: SingleCalendarOperationType, imageHint?: string) => Promise<Event | null>;
}

export const AssistantPanel: FC<AssistantPanelProps> = ({ open, onClose, events, people, onAiAction }) => {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (scrollAreaRef.current) { scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' }); } }, [messages]);

  const addMessage = (sender: ConversationMessage['sender'], text: string, options?: Partial<Omit<ConversationMessage, 'id' | 'sender' | 'text'>>) => {
    setMessages(prev => [...prev, { id: uid(), sender, text, ...options }]);
  };

  const handleSendMessage = async () => {
    if (input.trim() === '' || isProcessing) return;
    const userMessageText = input;
    addMessage('user', userMessageText);
    setInput('');
    setIsProcessing(true);

    const thinkingMessageId = uid();
    setMessages(prev => [...prev, { id: thinkingMessageId, sender: 'ai', text: "Assistenten tänker...", isProcessing: true }]);

    const mainLogic = async () => {
      const simplifiedEventsForAIContext = events.map(e => ({ title: e.title, date: e.start.slice(0, 10), startTime: e.start.slice(11, 16) }));
      const conversationHistoryForAI: { sender: 'user' | 'ai'; text: string }[] = messages.filter(msg => msg.id !== thinkingMessageId && (msg.sender === 'user' || msg.sender === 'ai')).map(msg => ({ sender: msg.sender as 'user' | 'ai', text: msg.text })).slice(-10);

      const tolkInput: TolkAIInput = {
        instruction: userMessageText,
        currentDate: formatDateFns(new Date(), 'yyyy-MM-dd HH:mm'),
        allCalendarEvents: simplifiedEventsForAIContext,
        conversationHistory: conversationHistoryForAI,
      };
      
      const tolkResponse: TolkAIOutput = await interpretUserInstruction(tolkInput);
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId));

      if (tolkResponse.userFeedbackMessage) addMessage('ai', tolkResponse.userFeedbackMessage);

      if (tolkResponse.requiresClarification && tolkResponse.clarificationQuestion) {
        if (!tolkResponse.userFeedbackMessage?.includes(tolkResponse.clarificationQuestion)) addMessage('ai', tolkResponse.clarificationQuestion, { isError: true });
      } else if (tolkResponse.planDescription) {
        addMessage('planStep', `Bearbetar plan...`, { isProcessing: true });
        const formatterResponse: FormatPlanOutput = await formatPlan({ planDescription: tolkResponse.planDescription, currentDate: formatDateFns(new Date(), 'yyyy-MM-dd') });
        setMessages(prev => prev.filter(m => m.sender !== 'planStep'));

        if (formatterResponse.operations && formatterResponse.operations.length > 0) {
          addMessage('systemInfo', `Startar exekvering av ${formatterResponse.operations.length} åtgärd(er)...`);
          for (const op of formatterResponse.operations) {
            const created = await onAiAction(op, tolkResponse.imageHint);
            if (created) { 
              addMessage('systemInfo', `✅ Händelse "${created.title}" skapad.`);
            } else { 
              addMessage('systemInfo', `⚠️ Misslyckades med åtgärd: ${op.commandType}`, {isError: true});
            }
          }
        } else {
            addMessage('systemInfo', "⚠️ AI:n kunde inte skapa några åtgärder från planen.", {isError: true});
        }
      }
    };
    
    try { await Promise.race([mainLogic(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), AI_PROCESS_TIMEOUT))]); } 
    catch (error: any) { setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId)); addMessage('ai', `Ett fel uppstod: ${error.message}`, { isError: true }); } 
    finally { setIsProcessing(false); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ ease: "easeInOut", duration: 0.3 }} className="fixed bottom-0 left-0 right-0 z-50 md:bottom-4 md:right-4 md:left-auto w-full md:w-[380px] md:max-w-[92vw]">
          <Card className="bg-neutral-900/90 backdrop-blur-lg border-neutral-800 shadow-xl flex flex-col h-[85vh] md:h-[60vh] rounded-b-none md:rounded-b-lg">
            <CardHeader className="pb-2 flex-shrink-0"><CardTitle className="text-sm tracking-tight flex items-center gap-2"><Bot className="w-5 h-5" /> Assistent</CardTitle></CardHeader>
            <ScrollArea className="flex-grow p-4" ref={scrollAreaRef}>
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex items-start gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                    {msg.sender === 'ai' && <Bot className="h-6 w-6 text-primary flex-shrink-0 mt-1" />}
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${ msg.sender === 'user' ? 'bg-blue-600 text-white' : msg.sender === 'ai' ? (msg.isError ? 'bg-red-900/50' : 'bg-neutral-800') : 'bg-transparent italic text-neutral-400 text-xs text-center w-full' }`}>
                      {msg.text} {msg.isProcessing && <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin" />}
                    </div>
                    {msg.sender === 'user' && <User className="h-6 w-6 text-neutral-400 flex-shrink-0 mt-1" />}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="p-4 border-t border-neutral-800 flex-shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex w-full items-center space-x-2">
                <Textarea placeholder="Skriv till assistenten..." value={input} onChange={(e) => setInput(e.target.value)} disabled={isProcessing} className="flex-1 bg-neutral-800 border-neutral-700 text-sm md:text-base min-h-0" rows={1} />
                <Button type="submit" size="icon" disabled={isProcessing || input.trim() === ''}><Send className="h-4 w-4" /></Button>
              </form>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
