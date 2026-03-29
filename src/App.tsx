import React, { useState, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import { Upload, X, ArrowRightLeft, Search, Languages, Globe, User, Bot, ChevronDown, Link as LinkIcon, FileText, MoreVertical, Sun, Moon, Send, Paperclip, ScanText, Copy, Check } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'search' | 'translate' | 'extract'>('search');
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileData, setFileData] = useState<FileData[]>([]);
  const [withExplanation, setWithExplanation] = useState(false);
  const [translationDir, setTranslationDir] = useState<'en-ar' | 'ar-en'>('en-ar');
  const [searchMessages, setSearchMessages] = useState<Message[]>([]);
  const [translateMessages, setTranslateMessages] = useState<Message[]>([]);
  const [extractMessages, setExtractMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('Qwen/Qwen2.5-72B-Instruct');
  const [isDark, setIsDark] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const currentMessages = activeTab === 'search' ? searchMessages : activeTab === 'translate' ? translateMessages : extractMessages;
  const setCurrentMessages = activeTab === 'search' ? setSearchMessages : activeTab === 'translate' ? setTranslateMessages : setExtractMessages;
  
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

  const handleCopyText = async (text: string, msgId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(msgId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleExtractSubmit = async () => {
    if (fileData.length === 0) return;

    const userMsgId = Date.now().toString();
    const newUserMsg: Message = {
      id: userMsgId,
      role: 'user',
      text: 'استخراج النصوص من الملف',
      files: [...fileData],
    };

    const modelMsgId = (Date.now() + 1).toString();
    const newModelMsg: Message = {
      id: modelMsgId,
      role: 'model',
      text: '',
      loading: true,
    };

    setExtractMessages(prev => [...prev, newUserMsg, newModelMsg]);
    setLoading(true);

    const currentFileData = [...fileData];
    setSelectedFiles([]);
    setFileData([]);

    try {
      const response = await fetch('/api/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: currentFileData }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'حدث خطأ أثناء استخراج النصوص.');
      }

      setExtractMessages(prev => prev.map(msg =>
        msg.id === modelMsgId
          ? { ...msg, text: data.text, loading: false }
          : msg
      ));
    } catch (error: any) {
      console.error('Error extracting text:', error);
      setExtractMessages(prev => prev.map(msg =>
        msg.id === modelMsgId
          ? { ...msg, text: error.message || 'حدث خطأ أثناء استخراج النصوص.', loading: false }
          : msg
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (activeTab === 'extract') {
      return handleExtractSubmit();
    }
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
    <div dir="rtl" className={`min-h-screen flex flex-col relative z-0 h-screen overflow-hidden transition-colors duration-500 ${isDark ? 'text-white bg-black' : 'text-gray-900 bg-black'}`} style={{ fontFamily: "'Cairo', sans-serif" }}>
      
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
      <div className={`fixed inset-0 -z-10 transition-all duration-500 ${isDark ? 'bg-gradient-to-b from-black/40 via-transparent to-black/60' : 'bg-gradient-to-b from-black/20 via-transparent to-black/30'}`} />

      <div className="flex-grow flex flex-col z-10 h-full max-w-7xl mx-auto w-full p-2 md:p-6">
        
        <header className={`flex flex-col items-center shrink-0 transition-all duration-500 ${currentMessages.length > 0 ? 'mb-2 md:mb-6' : 'mb-6'}`}>
          <h1 className={`font-extrabold drop-shadow-lg flex items-center justify-center gap-3 transition-all duration-500 ${isDark ? 'text-white' : 'text-gray-800'} ${currentMessages.length > 0 ? 'text-xl md:text-4xl mb-1 md:mb-2' : 'text-3xl md:text-4xl mb-2'}`}>
            <img 
              src="/book-mascot.png" 
              alt="شعار جيو ماستر" 
              className={`drop-shadow-[0_0_10px_rgba(234,179,8,0.4)] transition-all object-contain ${currentMessages.length > 0 ? 'w-8 h-8 md:w-12 md:h-12' : 'w-12 h-12 md:w-14 md:h-14'}`}
            />
            جيو ماستر
          </h1>
          
          <div className={`flex items-center gap-3 md:gap-5 mt-2 md:mt-5 transition-all duration-500 ${currentMessages.length > 0 ? 'scale-90 md:scale-100' : ''}`}>
            <button
              onClick={() => setActiveTab('search')}
              className={`glass-tab px-5 md:px-8 py-2 md:py-3 rounded-2xl text-sm md:text-base font-bold transition-all duration-300 flex items-center gap-2.5 border-2 ${
                activeTab === 'search' 
                  ? isDark
                    ? 'bg-white/20 border-white/40 text-white shadow-[0_8px_32px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.3),0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-xl scale-105'
                    : 'bg-teal-500/25 border-teal-400/50 text-teal-900 shadow-[0_8px_32px_rgba(20,184,166,0.2),inset_0_1px_0_rgba(255,255,255,0.5),0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl scale-105'
                  : isDark
                    ? 'bg-white/8 border-white/15 text-white/80 hover:bg-white/15 hover:border-white/30 hover:scale-102 backdrop-blur-lg shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
                    : 'bg-white/40 border-gray-300/50 text-gray-600 hover:bg-white/60 hover:border-teal-300/50 hover:scale-102 backdrop-blur-lg shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]'
              }`}
            >
              <Search size={18} className="md:w-[20px] md:h-[20px]" />
              <span className={currentMessages.length > 0 ? 'hidden md:inline' : 'inline'}>البحث الجغرافي</span>
            </button>
            <button
              onClick={() => setActiveTab('translate')}
              className={`glass-tab px-5 md:px-8 py-2 md:py-3 rounded-2xl text-sm md:text-base font-bold transition-all duration-300 flex items-center gap-2.5 border-2 ${
                activeTab === 'translate' 
                  ? isDark
                    ? 'bg-white/20 border-white/40 text-white shadow-[0_8px_32px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.3),0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-xl scale-105'
                    : 'bg-teal-500/25 border-teal-400/50 text-teal-900 shadow-[0_8px_32px_rgba(20,184,166,0.2),inset_0_1px_0_rgba(255,255,255,0.5),0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl scale-105'
                  : isDark
                    ? 'bg-white/8 border-white/15 text-white/80 hover:bg-white/15 hover:border-white/30 hover:scale-102 backdrop-blur-lg shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
                    : 'bg-white/40 border-gray-300/50 text-gray-600 hover:bg-white/60 hover:border-teal-300/50 hover:scale-102 backdrop-blur-lg shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]'
              }`}
            >
              <Languages size={18} className="md:w-[20px] md:h-[20px]" />
              <span className={currentMessages.length > 0 ? 'hidden md:inline' : 'inline'}>المترجم الجغرافي</span>
            </button>
            <button
              onClick={() => setActiveTab('extract')}
              className={`glass-tab px-5 md:px-8 py-2 md:py-3 rounded-2xl text-sm md:text-base font-bold transition-all duration-300 flex items-center gap-2.5 border-2 ${
                activeTab === 'extract' 
                  ? isDark
                    ? 'bg-white/20 border-white/40 text-white shadow-[0_8px_32px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.3),0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-xl scale-105'
                    : 'bg-teal-500/25 border-teal-400/50 text-teal-900 shadow-[0_8px_32px_rgba(20,184,166,0.2),inset_0_1px_0_rgba(255,255,255,0.5),0_4px_12px_rgba(0,0,0,0.1)] backdrop-blur-xl scale-105'
                  : isDark
                    ? 'bg-white/8 border-white/15 text-white/80 hover:bg-white/15 hover:border-white/30 hover:scale-102 backdrop-blur-lg shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
                    : 'bg-white/40 border-gray-300/50 text-gray-600 hover:bg-white/60 hover:border-teal-300/50 hover:scale-102 backdrop-blur-lg shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]'
              }`}
            >
              <ScanText size={18} className="md:w-[20px] md:h-[20px]" />
              <span className={currentMessages.length > 0 ? 'hidden md:inline' : 'inline'}>استخراج النصوص</span>
            </button>
            
            <button
              onClick={() => setIsDark(prev => !prev)}
              className={`glass-tab p-2.5 md:p-3 rounded-2xl transition-all duration-300 border-2 ${
                isDark
                  ? 'bg-white/10 border-white/20 text-yellow-300 hover:bg-white/20 hover:border-yellow-400/40 backdrop-blur-lg shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]'
                  : 'bg-white/50 border-gray-300/50 text-indigo-600 hover:bg-white/70 hover:border-indigo-300/50 backdrop-blur-lg shadow-[0_4px_16px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)]'
              }`}
              title={isDark ? 'الوضع الفاتح' : 'الوضع الغامق'}
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        <div className="flex-grow overflow-y-auto flex flex-col gap-6 pb-4 px-2 md:px-4 scrollbar-hide">
          {currentMessages.length === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center text-center opacity-70">
              <img src="/book-mascot.png" alt="جيو ماستر" className="w-20 h-20 drop-shadow-[0_0_15px_rgba(234,179,8,0.4)] mb-4 object-contain" />
              <h2 className="text-2xl font-semibold mb-2">مرحباً بك في جيو ماستر</h2>
              <p className={`max-w-md transition-colors duration-500 ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                {activeTab === 'search' 
                  ? 'اطرح أي سؤال جغرافي وسأقوم بالبحث في المصادر الموثوقة للإجابة عليه.' 
                  : activeTab === 'translate'
                  ? 'أدخل أي مصطلح جغرافي لترجمته بدقة علمية بين العربية والإنجليزية.'
                  : 'ارفع صورة أو ملف PDF وسأستخرج منه جميع النصوص لتنسخها وتستخدمها.'}
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
                        ? isDark
                          ? 'msg-bubble-user bg-gradient-to-br from-blue-900/50 via-blue-800/30 to-cyan-900/40 border border-blue-400/20 shadow-[0_8px_32px_rgba(59,130,246,0.15),inset_0_1px_0_rgba(255,255,255,0.1),0_2px_4px_rgba(0,0,0,0.3)] backdrop-blur-md md:backdrop-blur-xl'
                          : 'msg-bubble-user bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 border border-teal-200/60 shadow-[0_8px_32px_rgba(20,184,166,0.1),inset_0_1px_0_rgba(255,255,255,0.8),0_2px_4px_rgba(0,0,0,0.05)] backdrop-blur-md md:backdrop-blur-xl'
                        : isDark
                          ? 'msg-bubble-ai bg-gradient-to-br from-slate-800/50 via-gray-800/30 to-slate-900/40 border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.08),0_2px_4px_rgba(0,0,0,0.3)] backdrop-blur-md md:backdrop-blur-xl'
                          : 'msg-bubble-ai bg-gradient-to-br from-white via-gray-50 to-slate-50 border border-gray-200/60 shadow-[0_8px_32px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9),0_2px_4px_rgba(0,0,0,0.04)] backdrop-blur-md md:backdrop-blur-xl'
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
                      <>
                        <div className={`markdown-body max-w-none text-right text-sm md:text-base leading-relaxed transition-colors duration-500 ${isDark ? 'text-gray-100 prose prose-invert' : 'text-gray-800 prose'}`} dir="rtl">
                          <Markdown>{msg.text}</Markdown>
                        </div>
                        {activeTab === 'extract' && msg.role === 'model' && msg.text && (
                          <button
                            onClick={() => handleCopyText(msg.text, msg.id)}
                            className={`mt-3 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-300 ${
                              copiedId === msg.id
                                ? isDark
                                  ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                  : 'bg-green-100 text-green-700 border border-green-300/50'
                                : isDark
                                  ? 'bg-white/10 text-gray-300 hover:bg-white/20 border border-white/10 hover:border-white/20'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200/60 hover:border-gray-300/60'
                            }`}
                          >
                            {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                            {copiedId === msg.id ? 'تم النسخ!' : 'نسخ النص'}
                          </button>
                        )}
                      </>
                    )}

                    {msg.showAlternatives && (
                      <div className={`mt-4 pt-3 border-t ${isDark ? 'border-white/10' : 'border-gray-200/60'}`}>
                        <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-blue-300' : 'text-teal-600'}`}>معاني وترجمات أخرى:</h4>
                        {msg.loadingAlternatives ? (
                          <div className="space-y-2 animate-pulse" dir="rtl">
                            <div className={`h-2 rounded w-3/4 ${isDark ? 'bg-blue-500/20' : 'bg-teal-500/20'}`}></div>
                            <div className={`h-2 rounded w-1/2 ${isDark ? 'bg-blue-500/20' : 'bg-teal-500/20'}`}></div>
                          </div>
                        ) : (
                          <div className={`markdown-body max-w-none text-right text-sm leading-relaxed ${isDark ? 'text-gray-300 prose prose-invert' : 'text-gray-600 prose'}`} dir="rtl">
                            <Markdown>{msg.alternatives || ''}</Markdown>
                          </div>
                        )}
                      </div>
                    )}

                    {msg.sources && msg.sources.length > 0 && (
                      <div className={`mt-4 pt-3 border-t ${isDark ? 'border-white/10' : 'border-gray-200/60'}`}>
                        <button 
                          onClick={() => toggleSources(msg.id)}
                          className={`flex items-center gap-2 text-xs transition-colors px-3 py-1.5 rounded-full border ${
                            isDark 
                              ? 'text-blue-300 hover:text-blue-200 bg-blue-900/20 border-blue-500/20' 
                              : 'text-teal-600 hover:text-teal-700 bg-teal-50 border-teal-200/50'
                          }`}
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
                                className={`text-xs truncate block p-2 rounded-lg border transition-colors ${
                                  isDark 
                                    ? 'text-gray-300 hover:text-blue-300 bg-black/20 border-white/5 hover:border-blue-500/30' 
                                    : 'text-gray-600 hover:text-teal-600 bg-gray-50 border-gray-200/50 hover:border-teal-300/50'
                                }`}
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
            
            <div className={`w-full relative rounded-3xl transition-all duration-500 p-[2px] ${
              isDark 
                ? 'bg-gradient-to-br from-teal-400/40 via-blue-500/30 to-purple-500/40' 
                : 'bg-gradient-to-br from-teal-400/60 via-cyan-400/40 to-blue-400/60'
            }`}>
              <div className={`w-full rounded-[22px] transition-all duration-500 ${
                isDark 
                  ? 'bg-gray-900/90 backdrop-blur-xl' 
                  : 'bg-white/85 backdrop-blur-xl'
              }`}>
                
                <div className={`flex items-center gap-2 px-4 py-2 border-b transition-colors duration-500 ${
                  isDark ? 'border-white/10' : 'border-gray-200/60'
                }`}>
                  <Bot size={14} className={isDark ? 'text-teal-400' : 'text-teal-600'} />
                  <div className="relative">
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className={`bg-transparent text-[10px] md:text-xs outline-none cursor-pointer appearance-none pr-1 pl-5 font-medium transition-colors duration-500 ${
                        isDark ? 'text-gray-300' : 'text-gray-600'
                      }`}
                      style={{ direction: 'rtl', fontFamily: "'Cairo', sans-serif" }}
                    >
                      {AVAILABLE_MODELS.map(m => (
                        <option key={m.id} value={m.id} className={isDark ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}>{m.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={10} className={`absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none rotate-180 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                  </div>

                  <div className="flex-grow" />

                  <div className="flex items-center gap-2">
                    {activeTab !== 'extract' && (
                      <label className={`flex items-center gap-1.5 cursor-pointer px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-medium transition-all duration-300 ${
                        isDark 
                          ? 'bg-white/5 hover:bg-white/10 text-gray-300' 
                          : 'bg-gray-100/80 hover:bg-gray-200/80 text-gray-600'
                      }`}>
                        <input
                          type="checkbox"
                          checked={withExplanation}
                          onChange={(e) => setWithExplanation(e.target.checked)}
                          className="w-3 h-3 accent-teal-500"
                        />
                        مع الشرح
                      </label>
                    )}

                    {activeTab === 'translate' && (
                      <button
                        onClick={() => setTranslationDir(prev => prev === 'en-ar' ? 'ar-en' : 'en-ar')}
                        className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] md:text-xs font-medium transition-all duration-300 ${
                          isDark 
                            ? 'bg-white/5 hover:bg-white/10 text-gray-300' 
                            : 'bg-gray-100/80 hover:bg-gray-200/80 text-gray-600'
                        }`}
                      >
                        {translationDir === 'en-ar' ? 'EN → AR' : 'AR → EN'}
                        <ArrowRightLeft size={11} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="px-4 py-2">
                  {fileData.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {fileData.map((file, idx) => (
                        <div key={idx} className={`relative inline-flex items-center gap-2 p-1.5 rounded-xl border pr-7 transition-colors duration-500 ${
                          isDark 
                            ? 'bg-white/5 border-white/15' 
                            : 'bg-gray-100/80 border-gray-200/80'
                        }`}>
                          {file.type.startsWith('image/') ? (
                            <img src={file.data} alt={`Preview ${idx + 1}`} className="h-8 w-8 object-cover rounded-lg border border-white/10" />
                          ) : (
                            <div className="h-8 w-8 flex flex-col items-center justify-center bg-red-500/15 rounded-lg text-red-400 border border-red-500/20">
                              <FileText size={14} />
                            </div>
                          )}
                          <span className={`text-[10px] max-w-[70px] truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`} dir="ltr">{file.name}</span>
                          <button
                            onClick={() => removeFile(idx)}
                            className="absolute top-1/2 -translate-y-1/2 right-1.5 bg-red-500/80 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="flex items-end gap-2">
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
                      className={`p-2 transition-all duration-300 rounded-xl cursor-pointer shrink-0 mb-0.5 ${
                        isDark 
                          ? 'text-gray-400 hover:text-teal-300 hover:bg-white/10' 
                          : 'text-gray-400 hover:text-teal-600 hover:bg-teal-50'
                      }`}
                      title="إرفاق صور أو ملفات PDF"
                    >
                      <Paperclip size={20} />
                    </label>

                    <textarea
                      ref={textareaRef}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={activeTab === 'search' ? "اسأل جيو ماستر..." : activeTab === 'translate' ? "أدخل المصطلح للترجمة..." : "ارفع صورة أو PDF لاستخراج النصوص..."}
                      className={`flex-grow bg-transparent border-none outline-none resize-none py-2 px-1 text-sm md:text-base leading-relaxed scrollbar-hide transition-colors duration-500 ${
                        isDark 
                          ? 'text-white placeholder-gray-500' 
                          : 'text-gray-800 placeholder-gray-400'
                      }`}
                      rows={1}
                      style={{ minHeight: '40px', fontFamily: "'Cairo', sans-serif" }}
                    />

                    <button
                      onClick={handleSubmit}
                      disabled={loading || (activeTab === 'extract' ? selectedFiles.length === 0 : (!inputText.trim() && selectedFiles.length === 0))}
                      className={`group p-2.5 rounded-xl transition-all duration-300 shrink-0 mb-0.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                        isDark
                          ? 'bg-gradient-to-br from-teal-500 to-blue-600 hover:from-teal-400 hover:to-blue-500 text-white shadow-[0_4px_15px_rgba(20,184,166,0.3)] hover:shadow-[0_6px_20px_rgba(20,184,166,0.5)]'
                          : 'bg-gradient-to-br from-teal-500 to-cyan-600 hover:from-teal-400 hover:to-cyan-500 text-white shadow-[0_4px_15px_rgba(20,184,166,0.25)] hover:shadow-[0_6px_20px_rgba(20,184,166,0.4)]'
                      }`}
                      title="إرسال"
                    >
                      <Send size={20} className="rotate-180 group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mt-3">
            <span className={`text-[10px] transition-colors duration-500 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>قد يعرض جيو ماستر معلومات غير دقيقة، لذا يُرجى التحقق من صحة الإجابات.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
