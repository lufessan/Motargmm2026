import { Router } from 'express';
import { HfInference } from '@huggingface/inference';
import Tesseract from 'tesseract.js';

const router = Router();

const ALLOWED_MODELS = [
  'Qwen/Qwen2.5-72B-Instruct',
  'meta-llama/Llama-3.3-70B-Instruct',
  'mistralai/Mistral-7B-Instruct-v0.2'
];

function getHF() {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    throw new Error('HUGGINGFACE_API_TOKEN is not configured.');
  }
  return new HfInference(token);
}

function validateModel(model) {
  return ALLOWED_MODELS.includes(model) ? model : 'Qwen/Qwen2.5-72B-Instruct';
}

async function extractTextFromImage(imageBase64) {
  try {
    const { data: { text } } = await Tesseract.recognize(
      imageBase64,
      'eng+ara',
      { logger: m => console.log('OCR Progress:', m.progress) }
    );
    return text.substring(0, 500);
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('Failed to extract text from image');
  }
}

async function callModel(hf, model, prompt) {
  const result = await hf.chatCompletion({
    model: model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
  });
  return result.choices?.[0]?.message?.content || '';
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

    let textToProcess = input.substring(0, 200);

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
      prompt = `أجب على هذا السؤال الجغرافي باللغة العربية باختصار: ${textToProcess}`;
    } else {
      if (translationDir === 'en-ar') {
        prompt = `أنت مترجم جغرافي أكاديمي متخصص. ترجم المصطلح الجغرافي التالي إلى العربية كما يُستخدم في الكتب الجغرافية الأكاديمية العربية. أعط الترجمة الأكاديمية المتخصصة فقط بدون أي شرح.\n\nمثال: landform = التضاريس | continental shelf = الجرف القاري | erosion = التعرية\n\nالمصطلح: ${textToProcess}\nالترجمة:`;
      } else {
        prompt = `You are an expert geographic translator. Translate the following Arabic term to English. Give ONLY the translation, no explanations.\n\nTerm: ${textToProcess}\nTranslation:`;
      }
    }

    let responseText;
    try {
      responseText = await callModel(hf, selectedModel, prompt);
    } catch (primaryError) {
      console.error('Primary model failed, trying fallback...', primaryError.message);
      const fallbackModel = selectedModel === 'Qwen/Qwen2.5-72B-Instruct'
        ? 'meta-llama/Llama-3.3-70B-Instruct'
        : 'Qwen/Qwen2.5-72B-Instruct';
      responseText = await callModel(hf, fallbackModel, prompt);
    }

    res.json({
      text: responseText || 'لم يتم الحصول على نتيجة.',
      sources: undefined,
    });
  } catch (error) {
    console.error('Chat API error:', error.message);
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
    if (translationDir === 'en-ar') {
      var prompt = `أعط ترجمتين بديلتين للمصطلح الجغرافي التالي إلى العربية. أعط الترجمات فقط بدون شرح، كل ترجمة في سطر:\n\n${textToProcess}`;
    } else {
      var prompt = `Give 2 alternative English translations for this Arabic geographic term. Give only translations, each on a new line:\n\n${textToProcess}`;
    }

    const responseText = await callModel(hf, selectedModel, prompt);

    res.json({ text: responseText || 'لم يتم الحصول على ترجمات بديلة.' });
  } catch (error) {
    console.error('Alternatives API error:', error.message);
    res.status(500).json({
      error: 'حدث خطأ أثناء جلب الترجمات البديلة.',
    });
  }
});

export default router;
