
"use client";

import type { FC } from 'react';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Bot, User, Send, Loader2 } from 'lucide-react';
import { 
  naturalLanguageEventCreation, 
  NaturalLanguageEventCreationOutput 
} from '@/ai/flows/natural-language-event-creation';
import type { CalendarEvent } from '@/types/event';
import { useToast } from '@/hooks/use-toast';
import { formatInputDate, parseFlexibleSwedishDateString, format } from '@/lib/date-utils';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  isProcessing?: boolean;
  requiresAction?: boolean; // For AI messages that need user input/clarification
}

interface AiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onAiCreateEvent: (eventDetails: any) => Promise<CalendarEvent | null>;
  onAiModifyEvent: (eventIdentifier: any, eventDetails: any) => Promise<CalendarEvent | null>;
  onAiDeleteEvent: (eventIdentifier: any) => Promise<string | null>;
}

const AiAssistant: FC<AiAssistantProps> = ({ 
  isOpen, 
  onClose, 
  onAiCreateEvent, 
  onAiModifyEvent, 
  onAiDeleteEvent 
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (input.trim() === '' || isProcessing) return;

    const userMessage: Message = { id: crypto.randomUUID(), sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setIsProcessing(true);
    
    // Add a thinking bubble for AI
    const thinkingMessageId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: thinkingMessageId, sender: 'ai', text: "Tänker...", isProcessing: true }]);

    try {
      const aiResponse: NaturalLanguageEventCreationOutput = await naturalLanguageEventCreation(currentInput);
      
      // Remove thinking bubble
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId));

      let responseText = aiResponse.userConfirmationMessage || "Jag har bearbetat din förfrågan.";
      let operationsPerformed = false;

      if (aiResponse.requiresClarification && aiResponse.clarificationQuestion) {
        responseText = aiResponse.clarificationQuestion;
        const aiClarificationMessage: Message = { id: crypto.randomUUID(), sender: 'ai', text: responseText, requiresAction: true };
        setMessages(prev => [...prev, aiClarificationMessage]);
      } else if (aiResponse.operations && aiResponse.operations.length > 0) {
        let opDetailsText = "";
        for (const operation of aiResponse.operations) {
          operationsPerformed = true;
          switch (operation.commandType.toUpperCase()) {
            case 'CREATE':
              if (operation.eventDetails) {
                const createdEvent = await onAiCreateEvent(operation.eventDetails);
                if (createdEvent) {
                  opDetailsText += `\nSkapade händelse: "${createdEvent.title}" den ${formatInputDate(parseFlexibleSwedishDateString(createdEvent.date, new Date()) || new Date())} kl ${createdEvent.startTime}.`;
                } else {
                  opDetailsText += `\nMisslyckades med att skapa en händelse baserat på: ${JSON.stringify(operation.eventDetails)}.`;
                }
              }
              break;
            case 'MODIFY':
              if (operation.eventIdentifier && operation.eventDetails) {
                const modifiedEvent = await onAiModifyEvent(operation.eventIdentifier, operation.eventDetails);
                if (modifiedEvent) {
                  opDetailsText += `\nÄndrade händelse: "${modifiedEvent.title}".`;
                } else {
                  opDetailsText += `\nMisslyckades med att ändra en händelse. Kunde inte hitta matchande händelse eller tolka nya detaljer.`;
                }
              }
              break;
            case 'DELETE':
              if (operation.eventIdentifier) {
                const deletedEventId = await onAiDeleteEvent(operation.eventIdentifier);
                if (deletedEventId) {
                  opDetailsText += `\nEn händelse har tagits bort.`;
                } else {
                  opDetailsText += `\nMisslyckades med att ta bort en händelse. Kunde inte hitta matchande händelse.`;
                }
              }
              break;
            default:
              opDetailsText += `\nOkänt kommando: ${operation.commandType}`;
          }
        }
        if (opDetailsText) {
          responseText += opDetailsText;
        }
        if (!operationsPerformed && !aiResponse.userConfirmationMessage) {
             responseText = "Jag är osäker på vad jag ska göra med den informationen.";
        }

        const aiResponseMessage: Message = { id: crypto.randomUUID(), sender: 'ai', text: responseText };
        setMessages(prev => [...prev, aiResponseMessage]);

      } else {
        // AI didn't ask for clarification but also didn't return operations.
        // Use its confirmation message, or a generic one.
        const aiResponseMessage: Message = { id: crypto.randomUUID(), sender: 'ai', text: responseText };
        setMessages(prev => [...prev, aiResponseMessage]);
      }

    } catch (error) {
       // Remove thinking bubble on error too
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId));
      console.error('AI Assistant Error:', error);
      const errorMessageText = "Ursäkta, jag kunde inte bearbeta din förfrågan just nu. Försök igen.";
      setMessages(prev => [...prev, { id: crypto.randomUUID(), sender: 'ai', text: errorMessageText }]);
      toast({
        title: 'AI Assistentfel',
        description: (error as Error).message || 'Ett okänt fel inträffade.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="p-6 pb-2">
          <SheetTitle className="font-headline flex items-center"><Bot className="mr-2 h-6 w-6 text-primary" /> VisuCal Assistent</SheetTitle>
          <SheetDescription>
            Chatta med AI:n för att hantera dina kalenderhändelser med naturligt språk (svenska). Exempel: "Skapa ett möte imorgon kl 14 om projektplanering" eller "Flytta lunchen till nästa fredag".
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-grow p-6" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                {msg.sender === 'ai' && <Bot className="h-6 w-6 text-primary flex-shrink-0" />}
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : msg.requiresAction ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' : 'bg-accent/20 text-accent-foreground'
                  }`}
                  style={ msg.sender === 'ai' && !msg.requiresAction ? { backgroundColor: 'var(--accent-foreground)', color: 'var(--accent)' } : {} }

                >
                  {msg.text}
                  {msg.isProcessing && <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin" />}
                </div>
                {msg.sender === 'user' && <User className="h-6 w-6 text-muted-foreground flex-shrink-0" />}
              </div>
            ))}
          </div>
        </ScrollArea>
        <SheetFooter className="p-6 pt-2 border-t">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex w-full items-center space-x-2"
          >
            <Input
              type="text"
              placeholder="Fråga något på svenska..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isProcessing}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={isProcessing || input.trim() === ''} aria-label="Skicka meddelande">
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default AiAssistant;
