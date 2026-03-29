import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import { Upload, X, ArrowRightLeft, Search, Languages, Globe, User, Bot, ChevronDown, Link as LinkIcon, FileText, MoreVertical } from 'lucide-react';

const AVAILABLE_MODELS = [
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (الأذكى والأدق)' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (سريع ومتوازن)' },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite (الخفيف)' }
];

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Source = {
  title: string;
  uri: string;
};

type FileData = {
  name: string;
  type: string;
  data: string;
};

type Message = {
  id: string;
  role: 'user' | 'model';
  text: string;
  files?: FileData[];
  sources?: Source[];
  loading?: boolean;
  showSources?: boolean;
  originalInput?: string;
  alternatives?: string;
  loadingAlternatives?: boolean;
  showAlternatives?: boolean;
  isTranslation?: boolean;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'translate'>('search');
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileData, setFileData] = useState<FileData[]>([]);
  const [withExplanation, setWithExplanation] = useState(false);
  const [translationDir, setTranslationDir] = useState<'en-ar' | 'ar-en'>('en-ar');
  const [searchMessages, setSearchMessages] = useState<Message[]>([]);
  const [translateMessages, setTranslateMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini-3.1-pro-preview');
  
  const currentMessages = activeTab === 'search' ? searchMessages : translateMessages;
  const setCurrentMessages = activeTab === 'search' ? setSearchMessages : setTranslateMessages;
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [currentMessages]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setSelectedFiles(prev => [...prev, ...files]);
      
      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFileData(prev => [...prev, {
            name: file.name,
            type: file.type,
            data: reader.result as string
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setFileData(prev => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputText]);

  const toggleSources = (id: string) => {
    setCurrentMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, showSources: !msg.showSources } : msg
    ));
  };

  const handleGetAlternatives = async (msgId: string, originalInput: string) => {
    setCurrentMessages(prev => prev.map(msg => 
      msg.id === msgId 
        ? { ...msg, showAlternatives: !msg.showAlternatives, loadingAlternatives: !msg.alternatives && !msg.showAlternatives ? true : msg.loadingAlternatives } 
        : msg
    ));

    const msgToUpdate = currentMessages.find(m => m.id === msgId);
    if (msgToUpdate?.alternatives || !originalInput) return;

    try {
      const prompt = `أعطني معاني وترجمات بديلة للنص التالي: "${originalInput}".
      يرجى تضمين:
      1. ترجمة حرفية.
      2. المعنى العام أو الشائع.
      3. المعنى بالعامية المصرية.
      اكتب الرد باختصار وتنسيق واضح في نقاط.`;

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents: prompt,
        config: {
          systemInstruction: "أنت خبير لغوي ومترجم محترف.",
        }
      });

      setCurrentMessages(prev => prev.map(msg => 
        msg.id === msgId 
          ? { ...msg, alternatives: response.text, loadingAlternatives: false }
          : msg
      ));
    } catch (error: any) {
      console.error('Error fetching alternatives:', error);
      let errorMessage = 'حدث خطأ أثناء جلب المعاني الإضافية.';
      if (error?.message?.includes('429') || error?.message?.includes('quota') || error?.status === 429) {
        errorMessage = 'عذراً، لقد تجاوزت الحد المسموح به للاستخدام (Quota Exceeded). يرجى المحاولة لاحقاً.';
      }
      setCurrentMessages(prev => prev.map(msg => 
        msg.id === msgId 
          ? { ...msg, alternatives: errorMessage, loadingAlternatives: false }
          : msg
      ));
    }
  };

  const handleSubmit = async () => {
    if (!inputText.trim() && selectedFiles.length === 0) return;

    const userMsgId = Date.now().toString();
    const newUserMsg: Message = {
      id: userMsgId,
      role: 'user',
      text: inputText,
      files: fileData.length > 0 ? [...fileData] : undefined,
    };

    const modelMsgId = (Date.now() + 1).toString();
    const newModelMsg: Message = {
      id: modelMsgId,
      role: 'model',
      text: '',
      loading: true,
      originalInput: inputText,
      isTranslation: activeTab === 'translate',
    };

    setCurrentMessages(prev => [...prev, newUserMsg, newModelMsg]);
    setLoading(true);
    
    const currentInput = inputText;
    const currentSelectedFiles = [...selectedFiles];
    const currentFileData = [...fileData];
    
    setInputText('');
    setSelectedFiles([]);
    setFileData([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const historyContents = currentMessages
        .filter(msg => !msg.loading && (msg.text || (msg.files && msg.files.length > 0)))
        .filter(msg => !(msg.role === 'model' && (msg.text.includes('حدث خطأ') || msg.text.includes('عذراً، لقد تجاوزت'))))
        .map(msg => {
          const msgParts: any[] = [];
          if (msg.role === 'user' && msg.files) {
            msg.files.forEach(file => {
              const base64Data = file.data.split(',')[1];
              if (base64Data) {
                msgParts.push({
                  inlineData: {
                    data: base64Data,
                    mimeType: file.type,
                  },
                });
              }
            });
          }
          if (msg.text) {
            msgParts.push({ text: msg.text });
          }
          if (msgParts.length === 0) {
            msgParts.push({ text: " " });
          }
          return { role: msg.role, parts: msgParts };
        });

      const currentParts: any[] = [];

      if (currentSelectedFiles.length > 0) {
        currentFileData.forEach((file, index) => {
          const base64Data = file.data.split(',')[1];
          if (base64Data) {
            currentParts.push({
              inlineData: {
                data: base64Data,
                mimeType: currentSelectedFiles[index].type,
              },
            });
          }
        });
      }

      let systemInstruction = '';
      let promptText = '';
      // Always enable Google Search to ensure connection to external sites as requested
      let tools: any[] = [{ googleSearch: {} }];

      if (activeTab === 'search') {
        systemInstruction = `You are an expert geographer and researcher. Your task is to answer geographical questions accurately using reputable international sources. 
        ${withExplanation ? 'Provide a detailed, comprehensive explanation in Arabic.' : 'Provide a very concise, direct answer in Arabic WITHOUT any detailed explanation.'}`;
        promptText = `Answer the following geographical query in Arabic:\n${currentInput}`;
      } else {
        systemInstruction = `You are an expert geography teacher and translator. Your task is to translate geographical terms between English and Arabic. 
        DO NOT provide literal translations like a standard translator. Provide the accurate, scientifically accepted geographical term in the target language.
        ${withExplanation ? 'Provide the translation AND a detailed geographical explanation of the term in Arabic.' : 'Provide ONLY the translated term concisely, without any explanation.'}`;
        promptText = `Translate the following geographical content from ${translationDir === 'en-ar' ? 'English to Arabic' : 'Arabic to English'}:\n${currentInput}`;
      }

      currentParts.push({ text: promptText });
      
      const finalContents = [...historyContents, { role: 'user', parts: currentParts }];

      let response;
      try {
        response = await ai.models.generateContent({
          model: selectedModel,
          contents: finalContents,
          config: {
            systemInstruction,
            tools,
          },
        });
      } catch (primaryError) {
        console.error('Primary model failed, trying fallback...', primaryError);
        // Fallback to another model if the selected one fails
        const fallbackModel = selectedModel === 'gemini-3.1-pro-preview' ? 'gemini-3-flash-preview' : 'gemini-3.1-pro-preview';
        response = await ai.models.generateContent({
          model: fallbackModel,
          contents: finalContents,
          config: {
            systemInstruction,
            tools,
          },
        });
      }

      // Extract sources from grounding metadata
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const extractedSources: Source[] = [];
      chunks.forEach((chunk: any) => {
        if (chunk.web?.uri && chunk.web?.title) {
          extractedSources.push({
            uri: chunk.web.uri,
            title: chunk.web.title
          });
        }
      });

      setCurrentMessages(prev => prev.map(msg => 
        msg.id === modelMsgId 
          ? { 
              ...msg, 
              text: response.text || 'لم يتم العثور على نتائج.', 
              sources: extractedSources.length > 0 ? extractedSources : undefined,
              loading: false 
            }
          : msg
      ));
    } catch (error: any) {
      console.error('Error generating content:', error);
      let errorMessage = 'حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.';
      if (error?.message?.includes('429') || error?.message?.includes('quota') || error?.status === 429) {
        errorMessage = 'عذراً، لقد تجاوزت الحد المسموح به للاستخدام (Quota Exceeded). يرجى المحاولة لاحقاً.';
      }
      setCurrentMessages(prev => prev.map(msg => 
        msg.id === modelMsgId 
          ? { ...msg, text: errorMessage, loading: false }
          : msg
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div dir="rtl" className="min-h-screen text-white font-sans flex flex-col relative z-0 h-screen overflow-hidden bg-black">
      
      {/* Background Image with referrerPolicy to prevent blocking */}
      <img 
        src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=3000&auto=format&fit=crop"
        alt="خلفية جغرافية"
        className="fixed inset-0 w-full h-full object-cover -z-10 opacity-60"
        referrerPolicy="no-referrer"
      />

      <div className="flex-grow flex flex-col z-10 h-full max-w-7xl mx-auto w-full p-2 md:p-6">
        
        {/* Header & Tabs */}
        <header className={`flex flex-col items-center shrink-0 transition-all duration-500 ${currentMessages.length > 0 ? 'mb-2 md:mb-6' : 'mb-6'}`}>
          <h1 className={`font-bold drop-shadow-lg text-white flex items-center justify-center gap-3 transition-all duration-500 ${currentMessages.length > 0 ? 'text-xl md:text-4xl mb-1 md:mb-2' : 'text-3xl md:text-4xl mb-2'}`}>
            <div className={`relative rounded-full overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.6)] flex items-center justify-center bg-black border border-blue-400/50 transition-all ${currentMessages.length > 0 ? 'w-6 h-6 md:w-10 md:h-10' : 'w-10 h-10'}`}>
              <img 
                src="https://images.pexels.com/photos/87651/earth-blue-planet-globe-planet-87651.jpeg?auto=compress&cs=tinysrgb&w=100" 
                alt="شعار جيو ماستر" 
                className="w-[115%] h-[115%] max-w-none object-cover"
              />
            </div>
            جيو ماستر
          </h1>
          
          {/* Separated Tabs */}
          <div className={`flex gap-2 md:gap-4 mt-2 md:mt-5 transition-all duration-500 ${currentMessages.length > 0 ? 'scale-90 md:scale-100' : ''}`}>
            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 md:px-6 py-1.5 md:py-2.5 rounded-full text-xs md:text-base font-medium transition-all flex items-center gap-2 border ${
                activeTab === 'search' 
                  ? 'bg-blue-600/30 border-blue-400/50 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
                  : 'bg-black/40 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <Search size={16} className="md:w-[18px] md:h-[18px]" />
              <span className={currentMessages.length > 0 ? 'hidden md:inline' : 'inline'}>البحث الجغرافي</span>
            </button>
            <button
              onClick={() => setActiveTab('translate')}
              className={`px-4 md:px-6 py-1.5 md:py-2.5 rounded-full text-xs md:text-base font-medium transition-all flex items-center gap-2 border ${
                activeTab === 'translate' 
                  ? 'bg-blue-600/30 border-blue-400/50 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
                  : 'bg-black/40 border-white/10 text-gray-300 hover:bg-white/10'
              }`}
            >
              <Languages size={16} className="md:w-[18px] md:h-[18px]" />
              <span className={currentMessages.length > 0 ? 'hidden md:inline' : 'inline'}>المترجم الجغرافي</span>
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-grow overflow-y-auto flex flex-col gap-6 pb-4 px-2 md:px-4 scrollbar-hide">
          {currentMessages.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center opacity-70">
              <Globe size={64} className="text-blue-400/50 mb-4" />
              <h2 className="text-2xl font-semibold mb-2">مرحباً بك في جيو ماستر</h2>
              <p className="text-gray-300 max-w-md">
                {activeTab === 'search' 
                  ? 'اطرح أي سؤال جغرافي وسأقوم بالبحث في المصادر الموثوقة للإجابة عليه.' 
                  : 'أدخل أي مصطلح جغرافي لترجمته بدقة علمية بين العربية والإنجليزية.'}
              </p>
            </div>
          ) : (
            currentMessages.map(msg => (
              <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className={`flex gap-3 max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}>
                  
                  {/* Avatar */}
                  <div className="shrink-0 mt-1">
                    {msg.role === 'user' ? (
                      <div className="w-8 h-8 rounded-full bg-blue-600/50 flex items-center justify-center border border-blue-400/30">
                        <User size={16} className="text-white" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full overflow-hidden shadow-[0_0_10px_rgba(59,130,246,0.4)] flex items-center justify-center bg-black border border-blue-400/50">
                        <img 
                          src="https://images.pexels.com/photos/87651/earth-blue-planet-globe-planet-87651.jpeg?auto=compress&cs=tinysrgb&w=100" 
                          alt="AI" 
                          className="w-[115%] h-[115%] max-w-none object-cover"
                        />
                      </div>
                    )}
                  </div>

                  {/* Message Bubble */}
                  <div className={`p-3 md:p-5 relative transition-all duration-300 ${
                    msg.role === 'user' 
                      ? 'border-r-2 border-blue-500/30' 
                      : 'border-l-2 border-blue-400/30'
                  }`}>
                    {msg.files && msg.files.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {msg.files.map((file, idx) => (
                          file.type.startsWith('image/') ? (
                            <img key={idx} src={file.data} alt={`User upload ${idx + 1}`} className="max-w-[150px] md:max-w-[200px] rounded-xl border border-white/20" />
                          ) : (
                            <div key={idx} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/20">
                              <div className="bg-red-500/20 p-2 rounded-lg text-red-400">
                                <FileText size={24} />
                              </div>
                              <span className="text-sm truncate max-w-[150px] text-gray-200" dir="ltr">{file.name}</span>
                            </div>
                          )
                        ))}
                      </div>
                    )}
                    
                    {msg.loading ? (
                      <div className="space-y-3 animate-pulse w-48 md:w-64" dir="rtl">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="flex h-2.5 w-2.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                          </span>
                          <span className="text-sm text-blue-300">جاري التفكير...</span>
                        </div>
                        <div className="h-3 bg-blue-500/20 rounded w-full"></div>
                        <div className="h-3 bg-blue-500/20 rounded w-5/6"></div>
                        <div className="h-3 bg-blue-500/20 rounded w-4/6"></div>
                      </div>
                    ) : (
                      <div className="markdown-body text-gray-100 prose prose-invert max-w-none text-right text-sm md:text-base leading-relaxed" dir="rtl">
                        <Markdown>{msg.text}</Markdown>
                      </div>
                    )}

                    {/* Alternatives Section */}
                    {msg.showAlternatives && (
                      <div className="mt-4 pt-3 border-t border-white/10">
                        <h4 className="text-sm font-semibold text-blue-300 mb-2">معاني وترجمات أخرى:</h4>
                        {msg.loadingAlternatives ? (
                          <div className="space-y-2 animate-pulse" dir="rtl">
                            <div className="h-2 bg-blue-500/20 rounded w-3/4"></div>
                            <div className="h-2 bg-blue-500/20 rounded w-1/2"></div>
                          </div>
                        ) : (
                          <div className="markdown-body text-gray-300 prose prose-invert max-w-none text-right text-sm leading-relaxed" dir="rtl">
                            <Markdown>{msg.alternatives || ''}</Markdown>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sources Section */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-white/10">
                        <button 
                          onClick={() => toggleSources(msg.id)}
                          className="flex items-center gap-2 text-xs text-blue-300 hover:text-blue-200 transition-colors bg-blue-900/20 px-3 py-1.5 rounded-full border border-blue-500/20"
                        >
                          <LinkIcon size={14} />
                          {msg.showSources ? 'إخفاء المصادر' : 'عرض المصادر'}
                        </button>
                        
                        {msg.showSources && (
                          <div className="mt-3 flex flex-col gap-2">
                            {msg.sources.map((src, idx) => (
                              <a 
                                key={idx} 
                                href={src.uri} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-xs text-gray-300 hover:text-blue-300 truncate block bg-black/20 p-2 rounded-lg border border-white/5 hover:border-blue-500/30 transition-colors"
                              >
                                • {src.title || src.uri}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Side Actions (Outside Bubble) */}
                  {msg.role === 'model' && msg.isTranslation && !msg.loading && msg.originalInput && (
                    <div className="flex flex-col justify-start mt-2 shrink-0">
                      <button 
                        onClick={() => handleGetAlternatives(msg.id, msg.originalInput!)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                        title="معاني وترجمات إضافية"
                      >
                        <MoreVertical size={20} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="shrink-0 mt-2 flex flex-col items-center">
          
          {/* Model Selector Attached to Search Box */}
          <div className="w-full max-w-2xl flex flex-col items-center relative z-20">
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-t-xl px-3 py-1 hover:bg-white/5 transition-colors shadow-lg mb-[-1px] border-b-0">
              <Bot size={14} className="text-blue-400" />
              <div className="relative">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-transparent text-[10px] md:text-xs text-gray-300 outline-none cursor-pointer appearance-none pr-1 pl-5"
                  style={{ direction: 'rtl' }}
                >
                  {AVAILABLE_MODELS.map(m => (
                    <option key={m.id} value={m.id} className="bg-gray-900 text-white">{m.name}</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute left-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none rotate-180" />
              </div>
            </div>

            {/* Search Box with Neon Glow */}
            <div className="w-full relative bg-black/60 backdrop-blur-xl border border-white/20 rounded-2xl md:rounded-[2rem] shadow-[0_0_20px_rgba(59,130,246,0.15)] focus-within:shadow-[0_0_30px_rgba(59,130,246,0.3)] focus-within:border-blue-500/50 transition-all duration-300 p-1.5 flex items-end gap-1.5">
              
              <input
                type="file"
                accept="image/*,application/pdf"
                multiple
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                id="chat-file-upload"
              />
              <label
                htmlFor="chat-file-upload"
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10 cursor-pointer shrink-0 mb-0.5"
                title="إرفاق صور أو ملفات PDF"
              >
                <Upload size={18} />
              </label>
              
              <div className="flex-grow relative flex flex-col justify-center min-h-[40px]">
                {fileData.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5 mt-1.5 self-start px-1">
                    {fileData.map((file, idx) => (
                      <div key={idx} className="relative inline-flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-white/20 pr-6">
                        {file.type.startsWith('image/') ? (
                          <img src={file.data} alt={`Preview ${idx + 1}`} className="h-7 w-7 object-cover rounded border border-white/10" />
                        ) : (
                          <div className="h-7 w-7 flex flex-col items-center justify-center bg-red-500/20 rounded text-red-400 border border-red-500/20">
                            <FileText size={12} />
                          </div>
                        )}
                        <span className="text-[10px] max-w-[60px] truncate text-gray-300" dir="ltr">{file.name}</span>
                        <button
                          onClick={() => removeFile(idx)}
                          className="absolute top-1/2 -translate-y-1/2 right-1 bg-red-500/80 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                        >
                          <X size={8} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={activeTab === 'search' ? "اسأل جيو ماستر..." : "أدخل المصطلح للترجمة..."}
                  className="w-full bg-transparent border-none outline-none resize-none text-white placeholder-gray-400 py-2 px-1 text-sm md:text-base leading-relaxed scrollbar-hide"
                  rows={1}
                  style={{ minHeight: '40px' }}
                />
              </div>

              {/* Globe Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={loading || (!inputText.trim() && selectedFiles.length === 0)}
                className="relative group disabled:opacity-50 disabled:cursor-not-allowed transition-transform hover:scale-105 active:scale-95 shrink-0 mb-0.5 mr-0.5"
                title="إرسال"
              >
                <div className="absolute inset-0 bg-blue-500 rounded-full blur-lg opacity-40 group-hover:opacity-80 transition-opacity"></div>
                <div className="w-10 h-10 relative z-10 rounded-full overflow-hidden shadow-[0_0_15px_rgba(59,130,246,0.6)] flex items-center justify-center bg-black border border-blue-400/50 group-hover:border-blue-300 transition-colors">
                  <img 
                    src="https://images.pexels.com/photos/87651/earth-blue-planet-globe-planet-87651.jpeg?auto=compress&cs=tinysrgb&w=100" 
                    alt="إرسال" 
                    className="w-[115%] h-[115%] max-w-none object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3 mb-1 px-2">
            <label className="flex items-center gap-2 cursor-pointer bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10 hover:bg-white/10 transition-colors">
              <input
                type="checkbox"
                checked={withExplanation}
                onChange={(e) => setWithExplanation(e.target.checked)}
                className="w-3 h-3 accent-blue-500"
              />
              <span className="text-[10px] md:text-xs font-medium text-gray-200">مع الشرح</span>
            </label>

            {activeTab === 'translate' && (
              <button
                onClick={() => setTranslationDir(prev => prev === 'en-ar' ? 'ar-en' : 'en-ar')}
                className="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10 hover:bg-white/10 transition-colors text-[10px] md:text-xs font-medium text-gray-200"
              >
                {translationDir === 'en-ar' ? 'الإنجليزية ← العربية' : 'العربية ← الإنجليزية'}
                <ArrowRightLeft size={12} />
              </button>
            )}
          </div>
          <div className="text-center mt-2">
            <span className="text-[10px] text-gray-500">قد يعرض جيو ماستر معلومات غير دقيقة، لذا يُرجى التحقق من صحة الإجابات.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
