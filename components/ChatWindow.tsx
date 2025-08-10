
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { PaperAirplaneIcon, MicrophoneIcon } from './Icons';

// Using existing PaperAirplaneIcon from Icons.tsx, so SendIcon duplicate is not needed here.

// Fix: Define ChatWindowProps interface
interface ChatWindowProps {
  messages: ChatMessage[];
  onSendMessage: (messageText: string) => void;
  isLoadingAiResponse: boolean;
  isApiConfigured: boolean;
  onClearChat?: () => void; // Made optional as it's conditionally used
}

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, onSendMessage, isLoadingAiResponse, isApiConfigured, onClearChat }) => {
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !isLoadingAiResponse) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleStartListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Taligenkänning stöds inte i denna webbläsare.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'sv-SE';
    recognition.onstart = () => setIsListening(true);
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onSendMessage(transcript);
    };
    recognition.start();
  };

  return (
    <div className="bg-white shadow-lg rounded-lg p-4 flex flex-col h-64 md:h-80">
      <div className="flex justify-between items-center mb-2 border-b pb-2">
        <h3 className="text-sm font-semibold text-gray-700">VisuCal Assistant</h3>
        {onClearChat && (
          <button
            onClick={onClearChat}
            className="text-xs text-gray-500 hover:text-primary px-2 py-1 rounded hover:bg-primary-light transition-colors"
            aria-label="Clear chat history"
          >
            Clear Chat
          </button>
        )}
      </div>
      <div className="flex-grow overflow-y-auto mb-4 pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex mb-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[70%] p-3 rounded-lg shadow ${
                msg.sender === 'user'
                  ? 'bg-primary text-white rounded-br-none'
                  : 'bg-gray-200 text-gray-800 rounded-bl-none'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
              <p className={`text-xs mt-1 ${msg.sender === 'user' ? 'text-blue-100 text-right' : 'text-gray-500 text-left'}`}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        {isLoadingAiResponse && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[70%] p-3 rounded-lg shadow bg-gray-200 text-gray-800 rounded-bl-none">
              <p className="text-sm italic">VisuCal Bearbetar...</p> {/* Updated thinking message */}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex items-center border-t pt-3">
        <button
          type="button"
          onClick={handleStartListening}
          className={`px-3 py-2 bg-primary text-white rounded-l-md hover:bg-primary-hover disabled:bg-gray-400 flex items-center justify-center ${isListening ? 'animate-pulse' : ''}`}
          disabled={isLoadingAiResponse || !isApiConfigured}
          aria-label="Start voice input"
        >
          <MicrophoneIcon className="w-5 h-5" />
        </button>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isApiConfigured ? "Fråga VisuCal..." : "AI Assistent offline (API-nyckel saknas)"}
          className="flex-grow px-3 py-2 border-t border-b border-gray-300 focus:ring-primary focus:border-primary transition-shadow"
          aria-label="Chat message input"
          disabled={isLoadingAiResponse || !isApiConfigured}
        />
        <button
          type="submit"
          className="px-4 py-2 bg-primary text-white rounded-r-md hover:bg-primary-hover disabled:bg-gray-400 transition-colors flex items-center justify-center"
          disabled={isLoadingAiResponse || !inputText.trim() || !isApiConfigured}
          aria-label="Send chat message"
        >
          <PaperAirplaneIcon className="w-5 h-5" />
        </button>
      </form>
      {!isApiConfigured && (
         <p className="text-xs text-red-500 mt-2 text-center">
            Varning: API_KEY är inte konfigurerad eller AI-moduler kunde inte initieras. AI-chattfunktionen är inaktiverad.
          </p>
      )}
    </div>
  );
};

export default ChatWindow;