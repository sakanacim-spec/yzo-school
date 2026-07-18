"use client";

import { useState } from "react";
import { useOziow } from "@/hooks/useOziow";
import { Button, Input, Modal } from "@oziow/ui";
import { Bot, Send, User } from "lucide-react";

export function AiAssistant({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const oziow = useOziow();
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "Bonjour ! Je suis l'Assistant Oziow. Comment puis-je vous aider aujourd'hui ?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await oziow.aiConcierge.chatWithAssistant(userMessage);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.message }
      ]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Erreur: ${error.message}` }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Assistant IA Oziow" 
      description="Gérez votre tenant par la voix ou le texte."
      className="sm:max-w-[500px]"
    >
      <div className="flex flex-col h-[400px] mt-4 border rounded-md overflow-hidden bg-muted/20">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                  <Bot className="h-5 w-5" />
                </div>
              )}
              
              <div className={`rounded-lg px-4 py-2 max-w-[80%] ${
                msg.role === "user" 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-foreground"
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>

              {msg.role === "user" && (
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground">
                  <User className="h-5 w-5" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                <Bot className="h-5 w-5" />
              </div>
              <div className="rounded-lg px-4 py-2 bg-muted text-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce delay-75" />
                <span className="w-2 h-2 rounded-full bg-primary/50 animate-bounce delay-150" />
              </div>
            </div>
          )}
        </div>
        
        <div className="p-3 border-t bg-background">
          <form onSubmit={handleSend} className="flex gap-2">
            <Input 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder="Ex: Créer une clé API pour la prod..." 
              className="flex-1"
              disabled={isLoading}
            />
            <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}
