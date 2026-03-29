import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';

const router = Router();

const ALLOWED_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview'];

function getAI() {
  if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
    throw new Error('AI Integrations environment variables are not configured.');
  }
  return new GoogleGenAI({
    apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
    httpOptions: {
      apiVersion: "",
      baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
    },
  });
}

function validateModel(model) {
  return ALLOWED_MODELS.includes(model) ? model : 'gemini-2.5-flash';
}

router.get('/status', (req, res) => {
  res.json({ status: 'running' });
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

router.post('/chat', async (req, res) => {
  try {
    const { input, activeTab, withExplanation, translationDir, selectedModel: rawModel, files, history } = req.body;
    const selectedModel = validateModel(rawModel);

    const historyContents = (history || []).map(msg => {
      const msgParts = [];
      if (msg.role === 'user' && msg.files) {
        msg.files.forEach(file => {
          const base64Data = file.data.split(',')[1];
          if (base64Data) {
            msgParts.push({
              inlineData: { data: base64Data, mimeType: file.type },
            });
          }
        });
      }
      if (msg.text) {
        msgParts.push({ text: msg.text });
      }
      if (msgParts.length === 0) {
        msgParts.push({ text: ' ' });
      }
      return { role: msg.role, parts: msgParts };
    });

    const currentParts = [];
    if (files && files.length > 0) {
      files.forEach(file => {
        const base64Data = file.data.split(',')[1];
        if (base64Data) {
          currentParts.push({
            inlineData: { data: base64Data, mimeType: file.type },
          });
        }
      });
    }

    let systemInstruction = '';
    let promptText = '';
    const tools = [{ googleSearch: {} }];

    if (activeTab === 'search') {
      systemInstruction = `You are an expert geographer and researcher. Your task is to answer geographical questions accurately using reputable international sources. 
        ${withExplanation ? 'Provide a detailed, comprehensive explanation in Arabic.' : 'Provide a very concise, direct answer in Arabic WITHOUT any detailed explanation.'}`;
      promptText = `Answer the following geographical query in Arabic:\n${input}`;
    } else {
      systemInstruction = `You are an expert geography teacher and translator. Your task is to translate geographical terms between English and Arabic. 
        DO NOT provide literal translations like a standard translator. Provide the accurate, scientifically accepted geographical term in the target language.
        ${withExplanation ? 'Provide the translation AND a detailed geographical explanation of the term in Arabic.' : 'Provide ONLY the translated term concisely, without any explanation.'}`;
      promptText = `Translate the following geographical content from ${translationDir === 'en-ar' ? 'English to Arabic' : 'Arabic to English'}:\n${input}`;
    }

    currentParts.push({ text: promptText });
    const finalContents = [...historyContents, { role: 'user', parts: currentParts }];

    const ai = getAI();
    let response;

    try {
      response = await ai.models.generateContent({
        model: selectedModel,
        contents: finalContents,
        config: { systemInstruction, tools },
      });
    } catch (primaryError) {
      console.error('Primary model failed, trying fallback...', primaryError);
      const fallbackModel = selectedModel === 'gemini-2.5-flash' ? 'gemini-2.5-pro' : 'gemini-2.5-flash';
      response = await ai.models.generateContent({
        model: fallbackModel,
        contents: finalContents,
        config: { systemInstruction, tools },
      });
    }

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = [];
    chunks.forEach(chunk => {
      if (chunk.web?.uri && chunk.web?.title) {
        sources.push({ uri: chunk.web.uri, title: chunk.web.title });
      }
    });

    res.json({
      text: response.text || 'لم يتم العثور على نتائج.',
      sources: sources.length > 0 ? sources : undefined,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    const is429 = error?.message?.includes('429') || error?.message?.includes('quota') || error?.status === 429;
    res.status(is429 ? 429 : 500).json({
      error: is429
        ? 'عذراً، لقد تجاوزت الحد المسموح به للاستخدام (Quota Exceeded). يرجى المحاولة لاحقاً.'
        : 'حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.',
    });
  }
});

router.post('/alternatives', async (req, res) => {
  try {
    const { originalInput, selectedModel: rawModel } = req.body;
    const selectedModel = validateModel(rawModel);

    const prompt = `أعطني معاني وترجمات بديلة للنص التالي: "${originalInput}".
      يرجى تضمين:
      1. ترجمة حرفية.
      2. المعنى العام أو الشائع.
      3. المعنى بالعامية المصرية.
      اكتب الرد باختصار وتنسيق واضح في نقاط.`;

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: prompt,
      config: { systemInstruction: 'أنت خبير لغوي ومترجم محترف.' },
    });

    res.json({ text: response.text });
  } catch (error) {
    console.error('Alternatives API error:', error);
    const is429 = error?.message?.includes('429') || error?.message?.includes('quota') || error?.status === 429;
    res.status(is429 ? 429 : 500).json({
      error: is429
        ? 'عذراً، لقد تجاوزت الحد المسموح به للاستخدام (Quota Exceeded). يرجى المحاولة لاحقاً.'
        : 'حدث خطأ أثناء جلب المعاني الإضافية.',
    });
  }
});

export default router;
