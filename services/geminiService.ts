import { GoogleGenAI } from "@google/genai";
import { Message } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateReply = async (
  contactName: string,
  persona: string,
  history: Message[],
  userMessage: string,
  userName: string, // New parameter
  media?: string, // Base64 data URL (image or audio)
  mediaMimeType?: string,
  mediaType: 'image' | 'audio' = 'image'
): Promise<string> => {
  try {
    // Construct a chat history format
    const conversationContext = history.slice(-15).map(msg => {
      const senderName = msg.sender === 'me' ? userName : contactName;
      if (msg.image) {
        return `${senderName}: [Enviou uma imagem] ${msg.text || ''}`;
      }
      if (msg.audio) {
        return `${senderName}: [Enviou um áudio]`;
      }
      return `${senderName}: ${msg.text}`;
    }).join('\n');

    let parts: any[] = [];

    // Reset to basic system instruction relying on the passed persona
    const systemPrompt = `
      Você é ${contactName}.
      
      Instruções Críticas:
      1. **FRASES COMPLETAS**: Nunca corte a mensagem no meio. Termine o que começou a escrever.
      2. **NATURALIDADE**: Imite um chat real. Use gírias, letras minúsculas.
      3. **TAMANHO**: Mensagens curtas e diretas.
      4. **SEM SPAM DE LINK**: Analise o histórico recente abaixo. Se você já enviou o link do Fanvue nas últimas 3 mensagens, **NÃO ENVIE AGORA**. Responda normalmente sobre outro assunto.
      5. ${persona}

      Histórico da conversa:
      ${conversationContext}

      Mensagem atual do usuário (${userName}): ${userMessage}
    `;

    // Add media if present
    if (media && mediaMimeType) {
      // Remove header like "data:image/jpeg;base64," if present to get pure base64
      const base64Data = media.split(',')[1] || media;
      
      parts.push({
        inlineData: {
          mimeType: mediaMimeType,
          data: base64Data
        }
      });
      
      if (mediaType === 'audio') {
        parts.push({
          text: `${systemPrompt}\n\n[O usuário enviou um áudio. Responda ao conteúdo do áudio mantendo sua persona.]`
        });
      } else {
         parts.push({
          text: `${systemPrompt}\n\n[O usuário enviou uma imagem.]`
        });
      }
    } else {
      parts.push({
        text: systemPrompt
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        role: 'user',
        parts: parts
      },
      config: {
        // Balanced for naturalness
        temperature: 1.05, 
        // Increased to prevent cut-off sentences (was 400)
        maxOutputTokens: 1000, 
      }
    });

    return response.text || "rs";
  } catch (error) {
    console.error("Erro ao chamar Gemini:", error);
    return "Minha internet tá ruim amor, já te respondo...";
  }
};