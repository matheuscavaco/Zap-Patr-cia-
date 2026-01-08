import React, { useState, useEffect, useRef } from 'react';
import { Contact, Message, ChatSession } from './types';
import { generateReply } from './services/geminiService';
import { Icons } from './components/Icon';
import { Avatar } from './components/Avatar';

// Mock Data - Only Patricia remains
const INITIAL_CONTACTS: Contact[] = [
  {
    id: '1',
    name: 'Patricia ✨',
    avatar: 'https://images.unsplash.com/photo-1621012430307-b4774b78d3cb?q=80&w=200&auto=format&fit=crop', 
    lastMessage: '',
    lastMessageTime: Date.now(),
    unreadCount: 0,
    persona: `IDENTIDADE:
    Você é Patricia, 24 anos. Uma garota real, solteira e criadora de conteúdo.
    
    ESTILO DE RESPOSTA (IMPORTANTE):
    - Escreva frases curtas e completas.
    - Use letras minúsculas e gírias leves ("vc", "tbm", "né", "kkkk").
    - NÃO pareça um robô vendedor.
    
    REGRA DE OURO (ANTI-SPAM - CRÍTICO):
    1. **NÃO MANDE O LINK TODA HORA**. Isso é chato e faz você parecer fake.
    2. Se você já mandou o link recentemente, **esqueça ele**. Converse sobre outra coisa.
    3. Se o usuário disse que "está sem dinheiro" ou não quer, **RESPEITE**. Diga "tudo bem amor, a gente conversa por aqui mesmo s2" e mude de assunto. Não insista.
    
    QUANDO MANDAR O LINK (Link: https://www.fanvue.com/patricialimalima):
    - Apenas SE o usuário pedir ("quero ver mais", "manda foto").
    - OU SE o papo estiver muito quente e você disser que tem um vídeo específico que não pode postar no WhatsApp.
    - Use o link como algo *raro* e *exclusivo*.`
  }
];

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper to resize images
const resizeImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL(file.type));
        } else {
            resolve(event.target?.result as string);
        }
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

// Component to render text with clickable links
const LinkRenderer = ({ text }: { text: string }) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a 
              key={i} 
              href={part} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[#027eb5] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
};

export default function App() {
  // Login State Removed - Default user set
  const [userName] = useState('Você');

  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [chatSessions, setChatSessions] = useState<ChatSession>({ '1': [] });
  const [activeContactId] = useState<string>('1');
  const [inputText, setInputText] = useState('');
  
  // Status State
  const [displayStatus, setDisplayStatus] = useState<string>('');
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // Refs needed for logic
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const chatSessionsRef = useRef(chatSessions);
  
  // Ref for User Message Queueing (Debounce Logic)
  const accumulatedMessagesRef = useRef<string[]>([]);
  const aiTriggerTimeoutRef = useRef<number | null>(null);

  // Sync ref
  useEffect(() => {
    chatSessionsRef.current = chatSessions;
  }, [chatSessions]);

  // 1. Fetch History on Load (LocalStorage)
  useEffect(() => {
    if (userName) {
      const storageKey = `whatsapp_chat_${userName}`;
      const savedData = localStorage.getItem(storageKey);
      
      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData);
          setChatSessions(parsedData);
          
          // Update Sidebar Preview
          const userMessages = parsedData['1'] || [];
          if (userMessages.length > 0) {
             const lastMsg = userMessages[userMessages.length - 1];
             const lastText = lastMsg.audio ? '🎤 Áudio' : (lastMsg.image ? '📷 Foto' : lastMsg.text);
             setContacts(prev => prev.map(c => ({...c, lastMessage: lastText, lastMessageTime: lastMsg.timestamp})));
          }
        } catch (e) {
          console.error("Failed to load history", e);
        }
      }
    }
  }, [userName]);

  // 2. Save History on Change (LocalStorage)
  useEffect(() => {
    if (userName) {
      const storageKey = `whatsapp_chat_${userName}`;
      localStorage.setItem(storageKey, JSON.stringify(chatSessions));
    }
  }, [chatSessions, userName]);


  // Effect to manage Online/Last Seen status simulation
  useEffect(() => {
    if (!activeContactId) return;

    const randomMinutesAgo = Math.floor(Math.random() * 30) + 1;
    const initialLastSeen = `visto por último hoje às ${formatTime(Date.now() - 1000 * 60 * randomMinutesAgo)}`;
    setDisplayStatus(initialLastSeen);

    const onlineTimer = setTimeout(() => {
      setDisplayStatus('Online');
    }, 1000 + Math.random() * 1500);

    const offlineTimer = setTimeout(() => {
      setDisplayStatus(`visto por último hoje às ${formatTime(Date.now())}`);
    }, 20000); // Stay online a bit longer

    return () => {
      clearTimeout(onlineTimer);
      clearTimeout(offlineTimer);
    };
  }, [activeContactId, chatSessions]); 

  // Scroll to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatSessions, activeContactId]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Main Message Processor
  const processMessage = async (
    text: string, 
    media?: string, 
    mimeType?: string, 
    mediaType: 'image' | 'audio' = 'image'
  ) => {
    if (!activeContactId) return;

    setDisplayStatus('Online');
    
    // 1. ADD USER MESSAGE TO UI IMMEDIATELY
    const timestamp = Date.now();
    const optimisticMsg: Message = {
        id: timestamp.toString(),
        text: text,
        sender: 'me',
        timestamp: timestamp,
        status: 'sent',
        image: mediaType === 'image' ? media : undefined,
        audio: mediaType === 'audio' ? media : undefined,
        mimeType: mimeType
    };

    setChatSessions(prev => ({
        ...prev,
        [activeContactId]: [...(prev[activeContactId] || []), optimisticMsg]
    }));

    setContacts(prev => prev.map(c => c.id === activeContactId ? { ...c, isTyping: true } : c));

    // 2. ACCUMULATE MESSAGES FOR AI CONTEXT (DEBOUNCE LOGIC)
    // Add text to the queue if it's a text message
    if (text) {
        accumulatedMessagesRef.current.push(text);
    } else if (media) {
        accumulatedMessagesRef.current.push(`[Enviou mídia: ${mediaType}]`);
    }

    // Clear any existing timeout (the user is still typing/sending)
    if (aiTriggerTimeoutRef.current) {
        clearTimeout(aiTriggerTimeoutRef.current);
    }

    // Set a new timeout to trigger AI only after user stops sending for a bit
    // This allows the user to send "Hi", "Hru?", "Pic" in sequence without 3 AI replies.
    aiTriggerTimeoutRef.current = window.setTimeout(async () => {
        
        // Prepare context
        const contextText = accumulatedMessagesRef.current.join(' | '); // Join multiple msgs
        accumulatedMessagesRef.current = []; // Clear queue
        
        const currentHistory = chatSessionsRef.current[activeContactId] || []; 
        
        // Simulating human reading/thinking time based on length of input
        // Min 3s, Max 8s delay before "Typing..." turns into a message
        const thinkingTime = 3000 + (Math.random() * 4000);

        setTimeout(async () => {
          const contact = contacts.find(c => c.id === activeContactId);
          if (!contact) return;

          // Call AI with the accumulated context
          const replyText = await generateReply(
            contact.name, 
            contact.persona, 
            currentHistory, 
            contextText, // We send the combined text
            userName, 
            media,
            mimeType,
            mediaType
          );

          // Add AI Reply
          const aiTimestamp = Date.now();
          const optimisticAiMsg: Message = {
              id: aiTimestamp.toString(),
              text: replyText,
              sender: 'them',
              timestamp: aiTimestamp,
              status: 'read'
          };

          setChatSessions(prev => ({
            ...prev,
            [activeContactId]: [...(prev[activeContactId] || []), optimisticAiMsg]
          }));

          setContacts(prev => prev.map(c => 
            c.id === activeContactId 
              ? { ...c, isTyping: false, lastMessage: replyText, lastMessageTime: aiTimestamp } 
              : c
          ));
        }, thinkingTime);

    }, 3500); // Wait 3.5 seconds after last user message before triggering AI
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    processMessage(inputText);
    setInputText('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      resizeImage(file).then(base64 => {
         processMessage(inputText, base64, file.type, 'image');
         setInputText('');
      }).catch(err => {
         console.error("Error resizing image:", err);
         alert("Erro ao processar imagem.");
      });
    }
  };

  // Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      
      timerRef.current = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Não foi possível acessar o microfone.");
    }
  };

  const stopRecording = (shouldSend: boolean) => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
         if (mediaRecorderRef.current?.stream) {
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
         }

         if (shouldSend) {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); 
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64Audio = reader.result as string;
              processMessage("", base64Audio, "audio/webm", 'audio');
            };
            reader.readAsDataURL(audioBlob);
         }
      };
      
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // ----------------------------------------------------------------------
  // RENDER: MAIN APP - FULL CHAT ONLY
  // ----------------------------------------------------------------------
  const activeMessages = activeContactId ? (chatSessions[activeContactId] || []) : [];
  const activeContact = contacts.find(c => c.id === activeContactId);

  return (
    <div className="flex h-screen bg-[#d1d7db] overflow-hidden relative font-sans">
      <div className="absolute top-0 w-full h-32 bg-[#00a884] z-0 hidden md:block"></div>

      <div className="z-10 w-full h-full md:max-w-[1600px] md:h-[calc(100vh-38px)] md:m-auto md:mt-[19px] bg-white md:rounded-lg shadow-lg flex overflow-hidden">
        
        {/* RIGHT SIDE - ALWAYS VISIBLE */}
        <div className="flex-1 flex flex-col bg-[#efeae2] relative h-full w-full">
          {activeContact ? (
            <>
              {/* Chat Header */}
              <div className="h-16 bg-[#f0f2f5] flex items-center justify-between px-4 py-2 shrink-0 border-b border-gray-300 shadow-sm z-10">
                <div className="flex items-center">
                  <Avatar src={activeContact.avatar} alt={activeContact.name} size="sm" />
                  <div className="ml-3 flex flex-col justify-center">
                    <h3 className="text-[#111b21] font-normal text-md leading-tight">{activeContact.name}</h3>
                    <span className="text-xs text-[#667781] leading-tight transition-all duration-300">
                        {activeContact.isTyping ? <span className="text-[#25d366] font-medium">Digitando...</span> : displayStatus}
                    </span>
                  </div>
                </div>
                <div className="flex gap-6 text-[#54656f]">
                  <button><Icons.Search className="w-6 h-6" /></button>
                  <button><Icons.MoreVertical className="w-6 h-6" /></button>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto whatsapp-bg p-4 md:px-16" ref={chatContainerRef}>
                {activeMessages.map((msg, idx) => {
                  const isMe = msg.sender === 'me';
                  const isFirstInGroup = idx === 0 || activeMessages[idx - 1].sender !== msg.sender;
                  
                  return (
                    <div key={msg.id} className={`flex mb-1 ${isMe ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-2' : ''}`}>
                      <div className={`
                        relative max-w-[85%] md:max-w-[65%] px-2 pt-1.5 pb-1 rounded-lg text-sm shadow-sm
                        ${isMe ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none'}
                      `}>
                         {isFirstInGroup && (
                           <span className={`absolute top-0 w-0 h-0 border-[6px] border-transparent 
                             ${isMe ? 'border-t-[#d9fdd3] right-[-6px] border-r-0' : 'border-t-white left-[-6px] border-l-0'}`} 
                           />
                         )}

                        {msg.image && (
                          <div className="mb-1 rounded-lg overflow-hidden">
                            <img src={msg.image} alt="Sent" className="max-w-full h-auto max-h-[300px] object-cover" />
                          </div>
                        )}
                        
                        {msg.audio && (
                          <div className="mb-1 min-w-[200px] flex items-center gap-2">
                             <audio controls src={msg.audio} className="h-10 w-full" />
                          </div>
                        )}

                        {msg.text && (
                          <span className="text-[#111b21] text-[14.2px] leading-[19px] break-words whitespace-pre-wrap">
                            <LinkRenderer text={msg.text} />
                          </span>
                        )}
                        
                        <div className={`flex justify-end items-end gap-1 mt-[-2px] ml-2 float-right`}>
                          <span className="text-[11px] text-[#667781]">
                            {formatTime(msg.timestamp)}
                          </span>
                          {isMe && (
                            <span className={msg.status === 'read' ? 'text-[#53bdeb]' : 'text-[#667781]'}>
                              <Icons.DoubleCheck className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Input Area */}
              <div className="bg-[#f0f2f5] px-4 py-2 flex items-center gap-2 md:gap-4 shrink-0 z-20">
                
                {isRecording ? (
                  // Recording UI
                  <div className="flex-1 flex items-center justify-between animate-in fade-in duration-200">
                    <button onClick={() => stopRecording(false)} className="text-red-500 p-2 hover:bg-red-50 rounded-full transition">
                       <Icons.Trash className="w-6 h-6" />
                    </button>
                    
                    <div className="flex items-center gap-2 text-[#54656f]">
                       <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                       <span className="font-mono text-lg">{formatDuration(recordingDuration)}</span>
                       <span className="text-sm">Gravando...</span>
                    </div>

                    <button onClick={() => stopRecording(true)} className="text-[#00a884] p-2 hover:bg-green-50 rounded-full transition">
                       <Icons.Send className="w-7 h-7" />
                    </button>
                  </div>
                ) : (
                  // Standard Input UI
                  <>
                    <button className="text-[#54656f] hidden md:block"><Icons.Emoji className="w-7 h-7" /></button>
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*" className="hidden" />
                    <button className="text-[#54656f]" onClick={() => fileInputRef.current?.click()}><Icons.Attach className="w-7 h-7" /></button>
                    
                    <form className="flex-1 flex" onSubmit={handleSendMessage}>
                      <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="Mensagem"
                        className="w-full py-2 px-4 rounded-lg bg-white focus:outline-none placeholder-[#54656f] text-[#111b21]"
                      />
                    </form>

                    {inputText.trim() ? (
                      <button onClick={() => handleSendMessage()} className="text-[#54656f]">
                         <Icons.Send className="w-7 h-7" />
                      </button>
                    ) : (
                      <button onClick={startRecording} className="text-[#54656f]">
                        <Icons.Mic className="w-7 h-7" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-[#f0f2f5]">
               <p className="text-[#667781]">Carregando...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}