import { Router } from 'express';
import { HfInference } from '@huggingface/inference';
import Tesseract from 'tesseract.js';

const router = Router();

// NLLB models for translation (supports 200+ languages)
const ALLOWED_MODELS = [
  'facebook/nllb-200-distilled-600M',  // Fast, good quality
  'facebook/nllb-200-1.3B',             // Better quality
  'facebook/nllb-200-3.3B'              // Best quality
];

function getHF() {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    throw new Error('HUGGINGFACE_API_TOKEN is not configured. Get a free token from: https://huggingface.co/settings/tokens');
  }
  return new HfInference(token);
}

function validateModel(model) {
  return ALLOWED_MODELS.includes(model) ? model : 'facebook/nllb-200-distilled-600M';
}

// Extract text from image using Tesseract OCR
async function extractTextFromImage(imageBase64) {
  try {
    const { data: { text } } = await Tesseract.recognize(
      imageBase64,
      'eng+ara', // English and Arabic languages
      { logger: m => console.log('OCR Progress:', m.progress) }
    );
    return text;
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to extract text from image');
  }
}

// Translate text using NLLB
async function translateText(text, srcLang, tgtLang, model) {
  const hf = getHF();
  const response = await hf.translation({
    model,
    inputs: text,
    parameters: {
      src_lang: srcLang,
      tgt_lang: tgtLang,
    },
  });
  return response[0]?.translation_text || '';
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
        const imageData = files[0].data; // base64 data URL
        const extractedText = await extractTextFromImage(imageData);
        textToProcess = extractedText || input;
        console.log('Extracted text:', textToProcess);
      } catch (ocrError) {
        console.error('OCR failed, using input text instead:', ocrError);
        textToProcess = input;
      }
    }

    if (activeTab === 'search') {
      // For search, provide a simple geographic answer
      res.json({
        text: `جغرافيا: ${textToProcess}`,
        sources: undefined,
      });
    } else {
      // For translation, use NLLB model
      const srcLang = translationDir === 'en-ar' ? 'eng_Latn' : 'ara_Arab';
      const tgtLang = translationDir === 'en-ar' ? 'ara_Arab' : 'eng_Latn';

      const translatedText = await translateText(textToProcess, srcLang, tgtLang, selectedModel);

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

    // Get primary translation
    const primaryTranslation = await translateText(textToProcess, srcLang, tgtLang, selectedModel);

    // Fallback model for alternatives
    const fallbackModel = selectedModel === 'facebook/nllb-200-distilled-600M'
      ? 'facebook/nllb-200-1.3B'
      : 'facebook/nllb-200-distilled-600M';

    const alternativeTranslation = await translateText(textToProcess, srcLang, tgtLang, fallbackModel);

    const result = `**الترجمة الأساسية:**\n${primaryTranslation}\n\n**ترجمات بديلة:**\n${alternativeTranslation}`;

    res.json({ text: result });
  } catch (error) {
    console.error('Alternatives API error:', error);
    res.status(500).json({
      error: 'حدث خطأ أثناء جلب الترجمات البديلة.',
    });
  }
});

export default router;
