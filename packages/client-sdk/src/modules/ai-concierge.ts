import { OziowHttpClient } from '../client';

export class AiConciergeModule {
  constructor(private client: OziowHttpClient) {}

  /**
   * Envoie un message au Concierge IA et retourne un flux SSE (Server-Sent Events).
   * 
   * @param message Le message texte de l'utilisateur
   * @param sessionToken Le token de session (optionnel) pour continuer une conversation
   * @param onChunk Callback appelé à chaque nouveau fragment de texte
   * @param onSession Callback appelé au début pour récupérer le token de session généré
   * @param onError Callback appelé en cas d'erreur
   * @param onComplete Callback appelé à la fin du flux
   */
  async chatStream(
    message: string,
    sessionToken?: string,
    callbacks?: {
      onChunk?: (text: string) => void;
      onSession?: (token: string) => void;
      onError?: (error: string) => void;
      onComplete?: () => void;
    }
  ): Promise<void> {
    const url = `${this.client.options.baseURL}/v1/ai-concierge/chat`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Ajout de l'authentification (M2M API Key ou JWT selon la configuration du client)
    if (this.client.options.apiKey) {
      headers['x-api-key'] = this.client.options.apiKey;
    } else if (this.client.options.token) {
      headers['Authorization'] = `Bearer ${this.client.options.token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message, session_token: sessionToken }),
      });

      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Le corps de la réponse est vide');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          callbacks?.onComplete?.();
          break;
        }

        const chunkText = decoder.decode(value, { stream: true });
        
        // Les événements SSE sont séparés par \n\n
        const lines = chunkText.split('\n\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6);
            if (!dataStr) continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'session') {
                callbacks?.onSession?.(data.token);
              } else if (data.type === 'chunk') {
                callbacks?.onChunk?.(data.text);
              } else if (data.type === 'error') {
                callbacks?.onError?.(data.message);
              } else if (data.type === 'done') {
                callbacks?.onComplete?.();
                return;
              }
            } catch (e) {
              // Ignore invalid JSON chunks
            }
          }
        }
      }
    } catch (error: any) {
      callbacks?.onError?.(error.message);
    }
  }

  /**
   * Envoie un message à l'Assistant IA (Function Calling) et attend la réponse finale.
   * L'assistant peut déclencher des actions en arrière-plan.
   * 
   * @param message Le message texte de l'utilisateur
   */
  async chatWithAssistant(message: string): Promise<{ message: string; usage?: any }> {
    const url = `/v1/assistant/chat`;
    return this.client.post<{ message: string; usage?: any }>(url, { message });
  }
}
