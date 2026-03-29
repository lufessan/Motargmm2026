import { Router } from 'express';
import { HfInference } from '@huggingface/inference';
import Tesseract from 'tesseract.js';

const router = Router();

const ALLOWED_MODELS = [
  'mistralai/Mistral-7B-Instruct-v0.2',
  'meta-llama/Llama-2-7b-chat-hf',
  'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO'
];

function getHF() {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    throw new Error('HUGGINGFACE_API_TOKEN is not configured.');
  }
  return new HfInference(token);
}

function validateModel(model) {
  return ALLOWED_MODELS.includes(model) ? model : 'mistralai/Mistral-7B-Instruct-v0.2';
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

    const hf = getHF();
    let messages = [];
    let systemMessage = '';

    if (activeTab === 'search') {
      systemMessage = `You are an expert geographer and researcher. Your task is to answer geographical questions accurately and comprehensively in Arabic.`;
      messages = [
        { role: 'user', content: `${systemMessage}\n\nAnswer this geographical query in Arabic: ${textToProcess}` }
      ];
    } else {
      systemMessage = `You are an expert geography professor with PhD-level expertise. Your task is to translate geographic terms with precision and academic rigor.

CRITICAL RULES:
1. NEVER provide literal word-for-word translations
2. Translate based on GEOGRAPHIC CONTEXT and MEANING only
3. Use the accurate, scientifically accepted term a university geographer would use
4. Provide ONLY the translation, no explanations

EXAMPLES OF CORRECT TRANSLATIONS:
- "landform" → "أشكال سطح الأرض" (NOT "شكل الأرض")
- "erosion" → "التعرية" (NOT "التآكل")
- "watershed" → "حوض التصريف المائي" (NOT "فراغ المياه")
- "topography" → "الطبوغرافيا/تضاريس المنطقة" (NOT "أعلى الجغرافيا")`;

      const targetLang = translationDir === 'en-ar' ? 'Arabic' : 'English';
      messages = [
        { role: 'user', content: `${systemMessage}\n\nTranslate to ${targetLang}: ${textToProcess}` }
      ];
    }

    let result;
    try {
      result = await hf.conversational({
        model: selectedModel,
        inputs: {
          past_user_inputs: [],
          generated_responses: [],
          text: messages[0].content
        }
      });
    } catch (primaryError) {
      console.error('Primary model failed, trying fallback...', primaryError);
      const fallbackModel = selectedModel === 'mistralai/Mistral-7B-Instruct-v0.2'
        ? 'meta-llama/Llama-2-7b-chat-hf'
        : 'mistralai/Mistral-7B-Instruct-v0.2';

      result = await hf.conversational({
        model: fallbackModel,
        inputs: {
          past_user_inputs: [],
          generated_responses: [],
          text: messages[0].content
        }
      });
    }

    const responseText = result.generated_text || 'لم يتم الحصول على نتيجة.';

    res.json({
      text: responseText,
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

    const hf = getHF();
    const targetLang = translationDir === 'en-ar' ? 'Arabic' : 'English';

    const prompt = `You are a geography expert. Provide 2-3 alternative translations of "${textToProcess}" to ${targetLang}.
    
Each translation should be for a different geographic context or meaning. Format as:
1. Translation: [meaning and when to use]
2. Translation: [meaning and when to use]
3. Translation: [meaning and when to use]`;

    const result = await hf.conversational({
      model: selectedModel,
      inputs: {
        past_user_inputs: [],
        generated_responses: [],
        text: prompt
      }
    });

    res.json({ text: result.generated_text || 'لم يتم الحصول على ترجمات بديلة.' });
  } catch (error) {
    console.error('Alternatives API error:', error);
    res.status(500).json({
      error: 'حدث خطأ أثناء جلب الترجمات البديلة.',
    });
  }
});

export default router;
