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

// Translate with geographic expertise using AI model understanding
async function translateWithGeographicExpertise(text, srcLang, tgtLang, model) {
  const hf = getHF();
  
  const targetLang = tgtLang === 'ara_Arab' ? 'Arabic' : 'English';
  const sourceLang = srcLang === 'eng_Latn' ? 'English' : 'Arabic';
  
  const systemPrompt = `You are an expert geography professor with a PhD in Geographic Sciences. Your role is to translate geographic and scientific terms with precision and academic rigor.

CRITICAL RULES:
1. NEVER provide literal word-for-word translations
2. Translate based on MEANING and GEOGRAPHIC CONTEXT, not words
3. Use scientifically accurate terminology that a university geographer would use
4. If a term has multiple valid meanings in geography, choose the most specific one
5. For compound terms, translate as a meaningful phrase, not individual words
6. Provide the translation directly without explanation

EXAMPLES OF CORRECT vs INCORRECT:
- "landform" → CORRECT: "أشكال سطح الأرض" | WRONG: "شكل الأرض"
- "erosion" → CORRECT: "التعرية" | WRONG: "التآكل"
- "watershed" → CORRECT: "حوض التصريف المائي" | WRONG: "فراغ المياه"
- "topography" → CORRECT: "الطبوغرافيا/تضاريس المنطقة" | WRONG: "أعلى الجغرافيا"

Now translate this geographic text from ${sourceLang} to ${targetLang} with precision:
"${text}"

Respond ONLY with the accurate translation, nothing else.`;

  const response = await hf.textGeneration({
    model,
    inputs: systemPrompt,
    parameters: {
      max_new_tokens: 256,
      temperature: 0.3, // Low temperature for consistency
      top_p: 0.9,
      do_sample: true,
    },
  });

  return response.generated_text?.split('Respond ONLY with the accurate translation, nothing else.')[1]?.trim() || '';
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

    if (activeTab === 'search') {
      // For search, provide a geographic answer
      res.json({
        text: `جغرافيا: ${textToProcess}`,
        sources: undefined,
      });
    } else {
      // For translation with geographic expertise
      const srcLang = translationDir === 'en-ar' ? 'eng_Latn' : 'ara_Arab';
      const tgtLang = translationDir === 'en-ar' ? 'ara_Arab' : 'eng_Latn';

      const translatedText = await translateWithGeographicExpertise(textToProcess, srcLang, tgtLang, selectedModel);

      res.json({
        text: translatedText || 'لم يتم الحصول على ترجمة.',
        sources: undefined,
      });
    }
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

    const srcLang = translationDir === 'en-ar' ? 'eng_Latn' : 'ara_Arab';
    const tgtLang = translationDir === 'en-ar' ? 'ara_Arab' : 'eng_Latn';

    const targetLang = tgtLang === 'ara_Arab' ? 'Arabic' : 'English';
    const sourceLang = srcLang === 'eng_Latn' ? 'English' : 'Arabic';

    const hf = getHF();
    
    // Get primary translation
    const primaryTranslation = await translateWithGeographicExpertise(textToProcess, srcLang, tgtLang, selectedModel);

    // Use fallback model for alternatives
    const fallbackModel = selectedModel === 'mistralai/Mistral-7B-Instruct-v0.2'
      ? 'meta-llama/Llama-2-7b-chat-hf'
      : 'mistralai/Mistral-7B-Instruct-v0.2';

    const alternativeTranslation = await translateWithGeographicExpertise(textToProcess, srcLang, tgtLang, fallbackModel);

    const result = `**الترجمة الأساسية:**\n${primaryTranslation}\n\n**ترجمة بديلة:**\n${alternativeTranslation}`;

    res.json({ text: result });
  } catch (error) {
    console.error('Alternatives API error:', error);
    res.status(500).json({
      error: 'حدث خطأ أثناء جلب الترجمات البديلة.',
    });
  }
});

export default router;
