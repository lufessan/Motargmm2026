import { Router } from 'express';
import { HfInference } from '@huggingface/inference';
import Tesseract from 'tesseract.js';

const router = Router();

// Lightweight, fast models
const ALLOWED_MODELS = [
  'tiiuae/falcon-7b-instruct',
  'mistralai/Mistral-7B-Instruct-v0.2',
  'meta-llama/Llama-2-7b-chat-hf'
];

function getHF() {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    throw new Error('HUGGINGFACE_API_TOKEN is not configured.');
  }
  return new HfInference(token);
}

function validateModel(model) {
  return ALLOWED_MODELS.includes(model) ? model : 'tiiuae/falcon-7b-instruct';
}

// Extract text from image using Tesseract OCR
async function extractTextFromImage(imageBase64) {
  try {
    const { data: { text } } = await Tesseract.recognize(
      imageBase64,
      'eng+ara',
      { logger: m => console.log('OCR Progress:', m.progress) }
    );
    return text.substring(0, 500); // Limit extracted text
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

    let textToProcess = input.substring(0, 200); // Limit input length

    // If files are provided and it's translation mode, extract text from image
    if (files && files.length > 0 && activeTab === 'translate') {
      console.log('Processing image for OCR...');
      try {
        const imageData = files[0].data;
        const extractedText = await extractTextFromImage(imageData);
        textToProcess = extractedText || textToProcess;
        console.log('Extracted text:', textToProcess);
      } catch (ocrError) {
        console.error('OCR failed, using input text instead:', ocrError);
      }
    }

    const hf = getHF();
    let prompt = '';

    if (activeTab === 'search') {
      prompt = `Answer this geographic query in Arabic: ${textToProcess}`;
    } else {
      const targetLang = translationDir === 'en-ar' ? 'Arabic' : 'English';
      prompt = `Translate to ${targetLang} (expert geographic translation, not literal): ${textToProcess}`;
    }

    let result;
    try {
      result = await hf.conversational({
        model: selectedModel,
        inputs: {
          past_user_inputs: [],
          generated_responses: [],
          text: prompt
        }
      });
    } catch (primaryError) {
      console.error('Primary model failed, trying fallback...', primaryError);
      const fallbackModel = selectedModel === 'tiiuae/falcon-7b-instruct'
        ? 'mistralai/Mistral-7B-Instruct-v0.2'
        : 'tiiuae/falcon-7b-instruct';

      result = await hf.conversational({
        model: fallbackModel,
        inputs: {
          past_user_inputs: [],
          generated_responses: [],
          text: prompt
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
    const { originalInput, selectedModel: rawModel, translationDir } = req.body;
    const selectedModel = validateModel(rawModel);
    const textToProcess = originalInput.substring(0, 200);

    const hf = getHF();
    const targetLang = translationDir === 'en-ar' ? 'Arabic' : 'English';
    const prompt = `Give 2 alternative translations to ${targetLang}: ${textToProcess}`;

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
