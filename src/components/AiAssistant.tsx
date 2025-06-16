"use client";

import type { FC } from 'react';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetClose } from '@/components/ui/sheet';
import { Bot, User, Send, Loader2 } from 'lucide-react';
import { naturalLanguageEventCreation, NaturalLanguageEventCreationInput, NaturalLanguageEventCreationOutput } from '@/ai/flows/natural-language-event-creation';
import type { CalendarEvent } from '@/types/event';
import { useToast } from '@/hooks/use-toast';
import { formatInputDate, parse } from '@/lib/date-utils'; // For parsing dates from AI

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  isProcessing?: boolean;
}

interface AiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onAiCreateEvent: (eventDetails: any) => Promise<CalendarEvent | null>; // Returns created event or null
  onAiModifyEvent: (eventDetails: any) => Promise<CalendarEvent | null>;
  onAiDeleteEvent: (eventDetails: any) => Promise<string | null>; // Returns deleted event ID or null
}

const AiAssistant: FC<AiAssistantProps> = ({ isOpen, onClose, onAiCreateEvent, onAiModifyEvent, onAiDeleteEvent }) => {
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

    const userMessage: Message = { id: Date.now().toString(), sender: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      const aiInput: NaturalLanguageEventCreationInput = { instruction: userMessage.text };
      const aiResponse: NaturalLanguageEventCreationOutput = await naturalLanguageEventCreation(aiInput);
      
      let responseText = aiResponse.confirmationMessage || "I've processed your request.";

      if (aiResponse.calendarCommands && aiResponse.calendarCommands.length > 0) {
        for (const command of aiResponse.calendarCommands) {
          switch (command.command.toUpperCase()) {
            case 'CREATE':
              const createdEvent = await onAiCreateEvent(command.eventDetails);
              if (createdEvent) {
                responseText += `\nCreated event: "${createdEvent.title}" on ${formatInputDate(parse(createdEvent.date, 'yyyy-MM-dd', new Date()))} at ${createdEvent.startTime}.`;
              } else {
                 responseText += `\nFailed to create an event based on details: ${JSON.stringify(command.eventDetails)}.`;
              }
              break;
            case 'MODIFY':
              const modifiedEvent = await onAiModifyEvent(command.eventDetails);
               if (modifiedEvent) {
                responseText += `\nModified event: "${modifiedEvent.title}".`;
              } else {
                 responseText += `\nFailed to modify an event based on details: ${JSON.stringify(command.eventDetails)}. Could not find matching event.`;
              }
              break;
            case 'DELETE':
              const deletedEventId = await onAiDeleteEvent(command.eventDetails);
              if (deletedEventId) {
                responseText += `\nDeleted an event.`; // Details might be sensitive or hard to phrase from just ID.
              } else {
                 responseText += `\nFailed to delete an event based on details: ${JSON.stringify(command.eventDetails)}. Could not find matching event.`;
              }
              break;
            default:
              responseText += `\nUnknown command: ${command.command}`;
          }
        }
      }
      
      const aiMessage: Message = { id: (Date.now() + 1).toString(), sender: 'ai', text: responseText };
      setMessages(prev => [...prev, aiMessage]);

    } catch (error) {
      console.error('AI Assistant Error:', error);
      const errorMessage = "Sorry, I couldn't process that request. Please try again.";
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), sender: 'ai', text: errorMessage }]);
      toast({
        title: 'AI Assistant Error',
        description: (error as Error).message || 'An unknown error occurred.',
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
          <SheetTitle className="font-headline flex items-center"><Bot className="mr-2 h-6 w-6 text-primary" /> VisuCal Assistant</SheetTitle>
          <SheetDescription>
            Chat with the AI to manage your calendar events using natural language (Swedish). For example: "Skapa ett möte imorgon kl 14 om projektplanering".
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-grow p-6" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                {msg.sender === 'ai' && <Bot className="h-6 w-6 text-primary flex-shrink-0" />}
                <div
                  className={`max-w-[75%] rounded-lg px-4 py-2 text-sm ${
                    msg.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-accent/20 text-accent-foreground'
                  }`}
                  style={ msg.sender === 'ai' ? { backgroundColor: 'var(--accent-foreground)', color: 'var(--accent)' } : {} } /* Minor style adjustment for AI bubble to ensure contrast */

                >
                  {msg.text}
                  {msg.isProcessing && <Loader2 className="inline-block ml-2 h-4 w-4 animate-spin" />}
                </div>
                {msg.sender === 'user' && <User className="h-6 w-6 text-muted-foreground flex-shrink-0" />}
              </div>
            ))}
            {isProcessing && messages[messages.length-1]?.sender === 'user' && (
                 <div className="flex items-end gap-2">
                    <Bot className="h-6 w-6 text-primary flex-shrink-0" />
                    <div className="max-w-[75%] rounded-lg px-4 py-2 text-sm bg-accent/20 text-accent-foreground" style={{ backgroundColor: 'var(--accent-foreground)', color: 'var(--accent)' }}>
                        <Loader2 className="inline-block h-4 w-4 animate-spin" /> Processing...
                    </div>
                 </div>
            )}
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
              placeholder="Ask something in Swedish..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isProcessing}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={isProcessing || input.trim() === ''} aria-label="Send message">
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default AiAssistant;
