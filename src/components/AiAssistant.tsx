
"use client";

import type { FC } from 'react';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Bot, User, Send, Loader2, AlertTriangle, Zap } from 'lucide-react';
import { interpretUserInstruction } from '@/ai/flows/natural-language-event-creation';
import { formatPlan } from '@/ai/flows/format-plan-flow';
import type { AiEventType, ConversationMessageType, TolkAIOutput, FormatPlanOutput } from '@/ai/schemas';
import type { CalendarEvent } from '@/types/event';
import { useToast } from '@/hooks/use-toast';
import { format as formatDateFns } from 'date-fns';

interface Message {
  id: string;
  sender: 'user' | 'ai' | 'systemInfo' | 'planStep';
  text: string;
  isProcessing?: boolean;
  isError?: boolean;
}

interface AiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[]; 
  onAiCreateEvent: (eventDetails: any, imageHint?: string) => Promise<CalendarEvent | null>;
  onAiModifyEvent: (eventIdentifier: any, eventDetails: any, imageHint?: string) => Promise<CalendarEvent | null>;
  onAiDeleteEvent: (eventIdentifier: any) => Promise<string | null>;
}

const AiAssistant: FC<AiAssistantProps> = ({ 
  isOpen, 
  onClose, 
  events,
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

  const addMessage = (sender: Message['sender'], text: string, options?: Partial<Omit<Message, 'id'|'sender'|'text'>>) => {
    setMessages(prev => [...prev, { id: crypto.randomUUID(), sender, text, ...options }]);
  };

  const handleSendMessage = async () => {
    if (input.trim() === '' || isProcessing) return;

    const userMessageText = input;
    addMessage('user', userMessageText);
    setInput('');
    setIsProcessing(true);
    
    const thinkingMessageId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: thinkingMessageId, sender: 'ai', text: "VisuCal Tolk-AI:n tänker...", isProcessing: true }]);

    try {
      const simplifiedEventsForAIContext: AiEventType[] = events.map(e => ({
        title: e.title,
        date: e.date, 
        startTime: e.startTime, 
      }));

      const conversationHistoryForAI: ConversationMessageType[] = messages
        .filter(msg => msg.id !== thinkingMessageId && (msg.sender === 'user' || msg.sender === 'ai'))
        .map(msg => ({ sender: msg.sender as 'user' | 'ai', text: msg.text }))
        .slice(-10); 

      console.log("[AiAssistant UI] Sending to Tolk-AI. User Instruction:", userMessageText);
      if (conversationHistoryForAI.length > 0) {
          console.log("[AiAssistant UI] Conversation History for Tolk-AI (last 10):", JSON.stringify(conversationHistoryForAI.map(m => ({sender: m.sender, text: m.text.substring(0,70) + (m.text.length > 70 ? "..." : "")})), null, 2));
      }
      console.log("[AiAssistant UI] All current events for Tolk-AI's tool context (sample):", JSON.stringify(simplifiedEventsForAIContext.slice(0,2), null, 2) + (simplifiedEventsForAIContext.length > 2 ? `... and ${simplifiedEventsForAIContext.length-2} more` : ""));


      const tolkResponse: TolkAIOutput = await interpretUserInstruction(userMessageText, simplifiedEventsForAIContext, conversationHistoryForAI);
      
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId));
      console.log("[AiAssistant UI] Received from Tolk-AI:", JSON.stringify(tolkResponse, null, 2));

      if (tolkResponse.userFeedbackMessage) {
        addMessage('ai', `Tolk-AI: ${tolkResponse.userFeedbackMessage}`, { isError: tolkResponse.requiresClarification && tolkResponse.userFeedbackMessage.toLowerCase().includes("fel") });
      }

      if (tolkResponse.requiresClarification && tolkResponse.clarificationQuestion) {
        if (tolkResponse.clarificationQuestion !== tolkResponse.userFeedbackMessage && !tolkResponse.userFeedbackMessage.includes(tolkResponse.clarificationQuestion)) {
             addMessage('ai', `Tolk-AI: ${tolkResponse.clarificationQuestion}`, { isError: true });
        }
      } else if (tolkResponse.planDescription) {
        addMessage('planStep', `Planformaterar-AI:n bearbetar planen från Tolk-AI: "${tolkResponse.planDescription.substring(0,100)}${tolkResponse.planDescription.length > 100 ? "..." : ""}"`, { isProcessing: true });
        
        const currentDateStr = formatDateFns(new Date(), 'yyyy-MM-dd');
        const formatterResponse: FormatPlanOutput = await formatPlan({ planDescription: tolkResponse.planDescription, currentDate: currentDateStr });
        setMessages(prev => prev.filter(msg => msg.sender === 'planStep' && msg.isProcessing)); 
        
        console.log("[AiAssistant UI] Received from Planformaterar-AI:", JSON.stringify(formatterResponse, null, 2));

        if (formatterResponse.operations && formatterResponse.operations.length > 0) {
          addMessage('systemInfo', "Startar exekvering av plan...");

          for (const operation of formatterResponse.operations) {
            let outcomeMessage = "";
            let success = false;

            switch (operation.commandType.toUpperCase()) {
              case 'CREATE':
                if (operation.eventDetails) {
                  try {
                    const createdEvent = await onAiCreateEvent(operation.eventDetails, tolkResponse.imageHint);
                    if (createdEvent) {
                      outcomeMessage = `✅ Händelse "${createdEvent.title}" skapad.`;
                      success = true;
                    } else {
                      outcomeMessage = `⚠️ Misslyckades med att skapa händelse: ${operation.eventDetails.title || 'Okänd titel'}.`;
                    }
                  } catch (e: any) {
                    console.error("Error in onAiCreateEvent:", e);
                    outcomeMessage = `❌ Fel vid skapande av händelse "${operation.eventDetails.title || 'Okänd titel'}": ${e.message || 'Okänt fel'}.`;
                  }
                } else {
                  outcomeMessage = "❌ Fel: Skapa-kommando saknade händelsedetaljer.";
                }
                break;
              case 'MODIFY':
                if (operation.eventIdentifier && operation.eventDetails) {
                   try {
                      const modifiedEvent = await onAiModifyEvent(operation.eventIdentifier, operation.eventDetails, tolkResponse.imageHint);
                      if (modifiedEvent) {
                          outcomeMessage = `✅ Händelse "${modifiedEvent.title}" (tidigare: "${operation.eventIdentifier.title || 'Okänd'}") ändrad.`;
                          success = true;
                      } else {
                          outcomeMessage = `⚠️ Kunde inte hitta eller ändra händelsen: ${operation.eventIdentifier.title || 'Okänd titel'}.`;
                      }
                  } catch (e: any) {
                      console.error("Error in onAiModifyEvent:", e);
                      outcomeMessage = `❌ Fel vid ändring av händelse "${operation.eventIdentifier.title || 'Okänd titel'}": ${e.message || 'Okänt fel'}.`;
                  }
                } else {
                  outcomeMessage = "❌ Fel: Ändra-kommando saknade nödvändig information.";
                }
                break;
              case 'DELETE':
                if (operation.eventIdentifier) {
                  try {
                      const deletedEventId = await onAiDeleteEvent(operation.eventIdentifier);
                      if (deletedEventId) {
                          outcomeMessage = `✅ Händelse "${operation.eventIdentifier.title || 'Okänd'}" borttagen.`;
                          success = true;
                      } else {
                          outcomeMessage = `⚠️ Kunde inte hitta eller ta bort händelsen: ${operation.eventIdentifier.title || 'Okänd titel'}.`;
                      }
                  } catch (e: any) {
                      console.error("Error in onAiDeleteEvent:", e);
                      outcomeMessage = `❌ Fel vid borttagning av händelse "${operation.eventIdentifier.title || 'Okänd titel'}": ${e.message || 'Okänt fel'}.`;
                  }
                } else {
                  outcomeMessage = "❌ Fel: Ta bort-kommando saknade händelseidentifierare.";
                }
                break;
              case 'QUERY':
                break; 
              default:
                outcomeMessage = `❓ Okänt kommando från Planformaterar-AI: ${operation.commandType}`;
            }
            if (outcomeMessage) {
              addMessage('systemInfo', outcomeMessage, { isError: !success });
            }
          }
        } else if (tolkResponse.planDescription && (!formatterResponse.operations || formatterResponse.operations.length === 0)) {
            addMessage('systemInfo', "⚠️ Planformaterar-AI:n kunde inte skapa några konkreta åtgärder från Tolk-AI:ns plan.", {isError: true});
        }
      } else if (!tolkResponse.requiresClarification && !tolkResponse.planDescription && tolkResponse.userFeedbackMessage.startsWith("Tolk-AI:")) {
        // Handled above by adding Tolk-AI's userFeedbackMessage.
      }
      else {
         addMessage('ai', "Jag kunde inte helt tolka din förfrågan just nu. Försök igen med en annan formulering.", { isError: true });
      }

    } catch (error) {
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId && !(msg.sender === 'planStep' && msg.isProcessing)));
      console.error('VisuCal Assistent Fel:', error);
      const errorMessageText = "Ursäkta, jag stötte på ett internt fel. Försök igen om en liten stund.";
      addMessage('ai', errorMessageText, { isError: true });
      toast({
        title: 'VisuCal Assistentfel',
        description: (error as Error).message || 'Ett okänt fel inträffade med assistenten.',
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
            Chatta med AI:n för att hantera dina kalenderhändelser (svenska).
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-grow p-6" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex items-start gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                {msg.sender === 'ai' && <Bot className="h-6 w-6 text-primary flex-shrink-0 mt-1" />}
                {msg.sender === 'planStep' && <Zap className="h-6 w-6 text-amber-500 flex-shrink-0 mt-1" />}
                {msg.sender === 'systemInfo' && (
                    msg.text.startsWith("✅") ? <Zap className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" /> :
                    msg.text.startsWith("⚠️") ? <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-1" /> :
                    msg.text.startsWith("❌") ? <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0 mt-1" /> :
                    <AlertTriangle className="h-6 w-6 text-muted-foreground flex-shrink-0 mt-1" />
                )}
                
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : msg.sender === 'ai' 
                        ? msg.isError ? 'bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700' : 'bg-card text-card-foreground border'
                        : msg.sender === 'planStep'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 italic'
                          : msg.sender === 'systemInfo'
                            ? msg.isError ? 'bg-destructive/10 text-destructive border border-destructive/30' : 'bg-muted/50 text-muted-foreground border border-border'
                            : 'bg-accent/20 text-accent-foreground' 
                  }`}
                >
                  {msg.text}
                  {msg.isProcessing && <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin" />}
                </div>
                {msg.sender === 'user' && <User className="h-6 w-6 text-muted-foreground flex-shrink-0 mt-1" />}
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
              placeholder="Skapa möte imorgon kl 10..."
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
