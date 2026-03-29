import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import Tesseract from 'tesseract.js';

const router = Router();

const ALLOWED_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp'
];

function getAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }
  return new GoogleGenAI({ apiKey });
}

function validateModel(model) {
  return ALLOWED_MODELS.includes(model) ? model : 'gemini-1.5-pro';
}

// Extract text from image using Tesseract OCR
async function extractTextFromImage(imageBase64) {
  try {
    const { data: { text } } = await Tesseract.recognize(
      imageBase64,
      'eng+ara',
      { logger: m => console.log('OCR Progress:', m.progress) }
    );
    return text;
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to extract text from image');
  }
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
    const { input, activeTab, translationDir, selectedModel: rawModel, files } = req.body;
    const selectedModel = validateModel(rawModel);

    let textToProcess = input;

    // If files are provided and it's translation mode, extract text from image
    if (files && files.length > 0 && activeTab === 'translate') {
      console.log('Processing image for OCR...');
      try {
        const imageData = files[0].data;
        const extractedText = await extractTextFromImage(imageData);
        textToProcess = extractedText || input;
        console.log('Extracted text:', textToProcess);
      } catch (ocrError) {
        console.error('OCR failed, using input text instead:', ocrError);
        textToProcess = input;
      }
    }

    const ai = getAI();
    let systemPrompt = '';
    let userMessage = '';

    if (activeTab === 'search') {
      systemPrompt = `You are an expert geographer and researcher. Your task is to answer geographical questions accurately and comprehensively in Arabic.`;
      userMessage = `Answer this geographical query in Arabic: ${textToProcess}`;
    } else {
      systemPrompt = `You are an expert geography professor. Your task is to translate geographic terms with precision and academic rigor.
      
CRITICAL RULES:
1. NEVER provide literal word-for-word translations
2. Translate based on GEOGRAPHIC CONTEXT and MEANING
3. Use the accurate, scientifically accepted term a university geographer would use
4. Provide the translation directly without explanation

EXAMPLES:
- "landform" → "أشكال سطح الأرض" (NOT "شكل الأرض")
- "erosion" → "التعرية" (NOT "التآكل")  
- "watershed" → "حوض التصريف المائي" (NOT "فراغ المياه")`;
      
      const targetLang = translationDir === 'en-ar' ? 'Arabic' : 'English';
      userMessage = `Translate to ${targetLang}: ${textToProcess}`;
    }

    let response;
    try {
      response = await ai.models.generateContent({
        model: selectedModel,
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }
        ],
      });
    } catch (primaryError) {
      console.error('Primary model failed, trying fallback...', primaryError);
      const fallbackModel = selectedModel === 'gemini-2.0-flash' ? 'gemini-2.0-flash-exp' : 'gemini-2.0-flash';
      response = await ai.models.generateContent({
        model: fallbackModel,
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userMessage}` }] }
        ],
      });
    }

    res.json({
      text: response.text || 'لم يتم الحصول على نتيجة.',
      sources: undefined,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({
      error: 'حدث خطأ أثناء معالجة طلبك. يرجى المحاولة مرة أخرى.',
    });
  }
});

router.post('/alternatives', async (req, res) => {
  try {
    const { originalInput, selectedModel: rawModel, translationDir, files } = req.body;
    const selectedModel = validateModel(rawModel);

    let textToProcess = originalInput;

    // Extract text from image if provided
    if (files && files.length > 0) {
      try {
        const imageData = files[0].data;
        const extractedText = await extractTextFromImage(imageData);
        textToProcess = extractedText || originalInput;
      } catch (ocrError) {
        console.error('OCR failed for alternatives:', ocrError);
        textToProcess = originalInput;
      }
    }

    const ai = getAI();
    const targetLang = translationDir === 'en-ar' ? 'Arabic' : 'English';

    const prompt = `You are a geography expert. Provide alternative translations of "${textToProcess}" to ${targetLang}.
    
Give at least 2-3 variations with explanations of when each is used in geographic contexts.`;

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    res.json({ text: response.text || 'لم يتم الحصول على ترجمات بديلة.' });
  } catch (error) {
    console.error('Alternatives API error:', error);
    res.status(500).json({
      error: 'حدث خطأ أثناء جلب الترجمات البديلة.',
    });
  }
});

export default router;
