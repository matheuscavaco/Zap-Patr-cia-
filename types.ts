export interface Message {
  id: string;
  text: string;
  image?: string; // Base64 string for the image
  audio?: string; // Base64 string for audio
  mimeType?: string; // e.g. 'image/jpeg' or 'audio/webm'
  sender: 'me' | 'them';
  timestamp: number; // Unix timestamp
  status: 'sent' | 'delivered' | 'read';
}

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: number; // Unix timestamp
  unreadCount: number;
  persona: string; // Description for the AI
  isTyping?: boolean;
  isRecording?: boolean; // AI status for recording audio (simulated)
}

export interface ChatSession {
  [contactId: string]: Message[];
}