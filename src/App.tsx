import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { Upload, X, ArrowRightLeft, Search, Languages, Globe, User, Bot, ChevronDown, Link as LinkIcon, FileText, MoreVertical } from 'lucide-react';

const AVAILABLE_MODELS = [
  { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B (الأدق)' },
  { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B (سريع وذكي)' },
  { id: 'mistralai/Mistral-7B-Instruct-v0.2', name: 'Mistral 7B (خفيف)' }
];

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
  const [selectedModel, setSelectedModel] = useState('Qwen/Qwen2.5-72B-Instruct');
  
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
      const response = await fetch('/api/alternatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalInput, selectedModel }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch alternatives');
      }

      setCurrentMessages(prev => prev.map(msg => 
        msg.id === msgId 
          ? { ...msg, alternatives: data.text, loadingAlternatives: false }
          : msg
      ));
    } catch (error: any) {
      console.error('Error fetching alternatives:', error);
      setCurrentMessages(prev => prev.map(msg => 
        msg.id === msgId 
          ? { ...msg, alternatives: error.message || 'حدث خطأ أثناء جلب المعاني الإضافية.', loadingAlternatives: false }
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
    const currentFileData = [...fileData];
    
    setInputText('');
    setSelectedFiles([]);
    setFileData([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const history = currentMessages
        .filter(msg => !msg.loading && (msg.text || (msg.files && msg.files.length > 0)))
        .filter(msg => !(msg.role === 'model' && (msg.text.includes('حدث خطأ') || msg.text.includes('عذراً، لقد تجاوزت'))))
        .map(msg => ({
          role: msg.role,
          text: msg.text,
          files: msg.files,
        }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: currentInput,
          activeTab,
          withExplanation,
          translationDir,
          selectedModel,
          files: currentFileData.length > 0 ? currentFileData : undefined,
          history,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'حدث خطأ أثناء معالجة طلبك.');
      }

      setCurrentMessages(prev => prev.map(msg => 
        msg.id === modelMsgId 
          ? { 
              ...msg, 
              text: data.text, 
              sources: data.sources,
              loading: false 
            }
          : msg
      ));
    } catch (error: any) {
      console.error('Error generating content:', error);
      setCurrentMessages(prev => prev.map(msg => 
        msg.id === modelMsgId 
          ? { ...msg, text: error.message || 'حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.', loading: false }
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
    <div dir="rtl" className="min-h-screen text-white flex flex-col relative z-0 h-screen overflow-hidden bg-black" style={{ fontFamily: "'Cairo', sans-serif" }}>
      
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/sea-waves-poster.jpg"
        className="fixed inset-0 w-full h-full object-cover -z-10 opacity-70 motion-reduce:hidden"
      >
        <source src="/sea-waves-bg.mp4" type="video/mp4" />
      </video>
      <img
        src="/sea-waves-poster.jpg"
        alt=""
        className="fixed inset-0 w-full h-full object-cover -z-10 opacity-70 hidden motion-reduce:block"
      />
      <div className="fixed inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 -z-10" />

      <div className="flex-grow flex flex-col z-10 h-full max-w-7xl mx-auto w-full p-2 md:p-6">
        
        <header className={`flex flex-col items-center shrink-0 transition-all duration-500 ${currentMessages.length > 0 ? 'mb-2 md:mb-6' : 'mb-6'}`}>
          <h1 className={`font-extrabold drop-shadow-lg text-white flex items-center justify-center gap-3 transition-all duration-500 ${currentMessages.length > 0 ? 'text-xl md:text-4xl mb-1 md:mb-2' : 'text-3xl md:text-4xl mb-2'}`}>
            <img 
              src="/book-mascot.png" 
              alt="شعار جيو ماستر" 
              className={`drop-shadow-[0_0_10px_rgba(234,179,8,0.4)] transition-all object-contain ${currentMessages.length > 0 ? 'w-8 h-8 md:w-12 md:h-12' : 'w-12 h-12 md:w-14 md:h-14'}`}
            />
            جيو ماستر
          </h1>
          
          <div className={`flex gap-3 md:gap-5 mt-2 md:mt-5 transition-all duration-500 ${currentMessages.length > 0 ? 'scale-90 md:scale-100' : ''}`}>
            <button
              onClick={() => setActiveTab('search')}
              className={`glass-tab px-5 md:px-8 py-2 md:py-3 rounded-2xl text-sm md:text-base font-bold transition-all duration-300 flex items-center gap-2.5 border-2 ${
                activeTab === 'search' 
                  ? 'bg-white/20 border-white/40 text-white shadow-[0_8px_32px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.3),0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-xl scale-105' 
                  : 'bg-white/8 border-white/15 text-white/80 hover:bg-white/15 hover:border-white/30 hover:scale-102 backdrop-blur-lg shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
              }`}
            >
              <Search size={18} className="md:w-[20px] md:h-[20px]" />
              <span className={currentMessages.length > 0 ? 'hidden md:inline' : 'inline'}>البحث الجغرافي</span>
            </button>
            <button
              onClick={() => setActiveTab('translate')}
              className={`glass-tab px-5 md:px-8 py-2 md:py-3 rounded-2xl text-sm md:text-base font-bold transition-all duration-300 flex items-center gap-2.5 border-2 ${
                activeTab === 'translate' 
                  ? 'bg-white/20 border-white/40 text-white shadow-[0_8px_32px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.3),0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-xl scale-105' 
                  : 'bg-white/8 border-white/15 text-white/80 hover:bg-white/15 hover:border-white/30 hover:scale-102 backdrop-blur-lg shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
              }`}
            >
              <Languages size={18} className="md:w-[20px] md:h-[20px]" />
              <span className={currentMessages.length > 0 ? 'hidden md:inline' : 'inline'}>المترجم الجغرافي</span>
            </button>
          </div>
        </header>

        <div className="flex-grow overflow-y-auto flex flex-col gap-6 pb-4 px-2 md:px-4 scrollbar-hide">
          {currentMessages.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center opacity-70">
              <img src="/book-mascot.png" alt="جيو ماستر" className="w-20 h-20 drop-shadow-[0_0_15px_rgba(234,179,8,0.4)] mb-4 object-contain" />
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
                  
                  <div className="shrink-0 mt-1">
                    {msg.role === 'user' ? (
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-full overflow-hidden flex items-center justify-center">
                        <img src="/user-emoji.png" alt="المستخدم" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 md:w-14 md:h-14 rounded-full overflow-hidden flex items-center justify-center">
                        <img 
                          src="/ai-emoji.png" 
                          alt="AI" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>

                  <div className={`p-4 md:p-5 relative transition-all duration-300 rounded-2xl md:rounded-3xl ${
                      msg.role === 'user'
                        ? 'msg-bubble-user bg-gradient-to-br from-blue-900/50 via-blue-800/30 to-cyan-900/40 border border-blue-400/20 shadow-[0_8px_32px_rgba(59,130,246,0.15),inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.3)] backdrop-blur-md md:backdrop-blur-xl'
                        : 'msg-bubble-ai bg-gradient-to-br from-slate-800/50 via-gray-800/30 to-slate-900/40 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08),0_2px_4px_rgba(0,0,0,0.3)] backdrop-blur-md md:backdrop-blur-xl'
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

        <div className="shrink-0 mt-2 flex flex-col items-center">
          
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

              <button
                onClick={handleSubmit}
                disabled={loading || (!inputText.trim() && selectedFiles.length === 0)}
                className="relative group disabled:opacity-50 disabled:cursor-not-allowed transition-transform hover:scale-105 active:scale-95 shrink-0 mb-0.5 mr-0.5"
                title="إرسال"
              >
                <div className="absolute inset-0 bg-yellow-500 rounded-full blur-lg opacity-30 group-hover:opacity-60 transition-opacity"></div>
                <div className="w-10 h-10 relative z-10 flex items-center justify-center">
                  <img 
                    src="/book-mascot.png" 
                    alt="إرسال" 
                    className="w-10 h-10 object-contain group-hover:scale-110 transition-transform duration-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                  />
                </div>
              </button>
            </div>
          </div>

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
