
"use client";

import type { FC } from 'react';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Bot, User, Send, Loader2, AlertTriangle } from 'lucide-react';
import { 
  naturalLanguageEventCreation, 
  AiEventType,
  ConversationMessageType
} from '@/ai/flows/natural-language-event-creation';
import type { CalendarEvent } from '@/types/event';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  sender: 'user' | 'ai' | 'systemInfo';
  text: string;
  isProcessing?: boolean;
  requiresAction?: boolean; 
  isError?: boolean;
}

interface AiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  events: CalendarEvent[]; 
  onAiCreateEvent: (eventDetails: any) => Promise<CalendarEvent | null>;
  onAiModifyEvent: (eventIdentifier: any, eventDetails: any) => Promise<CalendarEvent | null>;
  onAiDeleteEvent: (eventIdentifier: any) => Promise<string | null>;
}

type NaturalLanguageEventCreationOutputType = Awaited<ReturnType<typeof naturalLanguageEventCreation>>;


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
    setMessages(prev => [...prev, { id: thinkingMessageId, sender: 'ai', text: "Orkestreraren tänker...", isProcessing: true }]);

    try {
      const simplifiedEventsForAI: AiEventType[] = events.map(e => ({
        title: e.title,
        date: e.date, 
        startTime: e.startTime, 
      }));

      // Filter out systemInfo messages before sending to AI
      const conversationHistoryForAI: ConversationMessageType[] = messages
        .filter(msg => msg.id !== thinkingMessageId && msg.sender !== 'systemInfo')
        .map(msg => ({ sender: msg.sender as 'user' | 'ai', text: msg.text }));


      console.log("[AiAssistant UI] Sending to AI Orchestrator. User Instruction:", userMessageText);
      console.log("[AiAssistant UI] Current Events for AI context:", JSON.stringify(simplifiedEventsForAI, null, 2));
      console.log("[AiAssistant UI] Conversation History for AI (last 5 relevant):", JSON.stringify(conversationHistoryForAI.slice(-5), null, 2));

      // Call the Orchestrator AI flow
      const orchestratorResponse: NaturalLanguageEventCreationOutputType = await naturalLanguageEventCreation(userMessageText, simplifiedEventsForAI, conversationHistoryForAI);
      
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId)); // Remove "thinking" message
      console.log("[AiAssistant UI] Received from AI Orchestrator:", JSON.stringify(orchestratorResponse, null, 2));

      // Handle Orchestrator's response
      if (orchestratorResponse.requiresClarification && orchestratorResponse.clarificationQuestion) {
        let clarificationMsg = orchestratorResponse.clarificationQuestion;
        if (orchestratorResponse.userConfirmationMessage && orchestratorResponse.userConfirmationMessage.length < 30) {
            clarificationMsg = `${orchestratorResponse.userConfirmationMessage} ${orchestratorResponse.clarificationQuestion}`;
        }
        addMessage('ai', clarificationMsg, { requiresAction: true });
      } else if (orchestratorResponse.operations && orchestratorResponse.operations.length > 0) {
        if (orchestratorResponse.userConfirmationMessage) {
          // Display the Orchestrator's plan/intent confirmation
          addMessage('ai', orchestratorResponse.userConfirmationMessage);
        } else {
          addMessage('ai', "Jag har tolkat din förfrågan och kommer nu att försöka utföra följande åtgärder:");
        }

        // Execute operations one by one and report outcomes
        for (const operation of orchestratorResponse.operations) {
          let outcomeMessage = "";
          let success = false;

          switch (operation.commandType.toUpperCase()) {
            case 'CREATE':
              if (operation.eventDetails) {
                try {
                  const createdEvent = await onAiCreateEvent(operation.eventDetails);
                  if (createdEvent) {
                    outcomeMessage = `Händelse "${createdEvent.title}" skapad.`;
                    success = true;
                  } else {
                    outcomeMessage = `Misslyckades med att skapa händelse baserat på detaljer: ${operation.eventDetails.title || 'Okänd titel'}.`;
                  }
                } catch (e) {
                  console.error("Error in onAiCreateEvent:", e);
                  outcomeMessage = `Ett fel uppstod vid skapande av händelse: ${operation.eventDetails.title || 'Okänd titel'}.`;
                }
              } else {
                outcomeMessage = "Fel: Skapa-kommando saknade händelsedetaljer.";
              }
              break;
            case 'MODIFY':
              if (operation.eventIdentifier && operation.eventDetails) {
                 try {
                    const modifiedEvent = await onAiModifyEvent(operation.eventIdentifier, operation.eventDetails);
                    if (modifiedEvent) {
                        outcomeMessage = `Händelse "${modifiedEvent.title}" (tidigare: "${operation.eventIdentifier.title || 'Okänd'}") ändrad.`;
                        success = true;
                    } else {
                        outcomeMessage = `Kunde inte hitta eller ändra händelsen specificerad som: ${operation.eventIdentifier.title || 'Okänd titel'}.`;
                    }
                } catch (e) {
                    console.error("Error in onAiModifyEvent:", e);
                    outcomeMessage = `Ett fel uppstod vid ändring av händelse: ${operation.eventIdentifier.title || 'Okänd titel'}.`;
                }
              } else {
                outcomeMessage = "Fel: Ändra-kommando saknade nödvändig information.";
              }
              break;
            case 'DELETE':
              if (operation.eventIdentifier) {
                try {
                    const deletedEventId = await onAiDeleteEvent(operation.eventIdentifier);
                    if (deletedEventId) {
                        outcomeMessage = `Händelse "${operation.eventIdentifier.title || 'Okänd'}" borttagen.`;
                        success = true;
                    } else {
                        outcomeMessage = `Kunde inte hitta eller ta bort händelsen specificerad som: ${operation.eventIdentifier.title || 'Okänd titel'}.`;
                    }
                } catch (e) {
                    console.error("Error in onAiDeleteEvent:", e);
                    outcomeMessage = `Ett fel uppstod vid borttagning av händelse: ${operation.eventIdentifier.title || 'Okänd titel'}.`;
                }
              } else {
                outcomeMessage = "Fel: Ta bort-kommando saknade händelseidentifierare.";
              }
              break;
            case 'QUERY':
              // Query results are expected in orchestratorResponse.userConfirmationMessage.
              // If userConfirmationMessage was already shown, this specific operation type might not need separate message.
              // However, the prompt for orchestrator now says QUERY should be in userConfirmationMessage and an op type.
              // Let's assume if operations array contains only a QUERY, the userConfirmationMessage is the answer.
              if (orchestratorResponse.operations.length === 1 && orchestratorResponse.userConfirmationMessage && !orchestratorResponse.requiresClarification) {
                // The main confirmation message already displayed the query result.
                outcomeMessage = ""; // No separate message needed here
                success = true;
              } else {
                outcomeMessage = `Frågeåtgärd registrerad: ${JSON.stringify(operation)}`;
                success = true; // Query itself is a "success" in terms of planning
              }
              break;
            default:
              outcomeMessage = `Okänt kommando från orkestreraren: ${operation.commandType}`;
          }
          if (outcomeMessage) { // Add a message only if there's something to say
            addMessage(success ? 'systemInfo' : 'systemInfo', outcomeMessage, { isError: !success });
          }
        }
      } else if (orchestratorResponse.userConfirmationMessage) { 
        // This handles QUERY responses or general acknowledgements if no ops/clarification
        addMessage('ai', orchestratorResponse.userConfirmationMessage);
      } else {
         addMessage('ai', "Jag kunde inte tolka din förfrågan just nu. Försök igen med en annan formulering.", { isError: true });
      }

    } catch (error) {
      setMessages(prev => prev.filter(msg => msg.id !== thinkingMessageId));
      console.error('AI Assistant UI Error:', error);
      const errorMessageText = "Ursäkta, jag stötte på ett internt fel i AI-assistenten. Försök igen om en liten stund.";
      addMessage('ai', errorMessageText, { isError: true });
      toast({
        title: 'AI Assistentfel',
        description: (error as Error).message || 'Ett okänt fel inträffade med AI-assistenten.',
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
            Chatta med AI:n för att hantera dina kalenderhändelser med naturligt språk (svenska). Orkestreraren tolkar din avsikt och föreslår åtgärder.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-grow p-6" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex items-start gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                {msg.sender === 'ai' && <Bot className="h-6 w-6 text-primary flex-shrink-0 mt-1" />}
                {msg.sender === 'systemInfo' && <AlertTriangle className={`h-6 w-6 ${msg.isError ? 'text-destructive' : 'text-muted-foreground'} flex-shrink-0 mt-1`} />}
                
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : msg.sender === 'ai' 
                        ? msg.requiresAction ? 'bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-700' : 'bg-card text-card-foreground border'
                        : msg.sender === 'systemInfo'
                          ? msg.isError ? 'bg-destructive/10 text-destructive border border-destructive/30' : 'bg-muted/50 text-muted-foreground border border-border'
                          : 'bg-accent/20 text-accent-foreground' /* Should not happen */
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

    