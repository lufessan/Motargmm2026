import { Router } from 'express';
import { HfInference } from '@huggingface/inference';

const router = Router();

const ALLOWED_MODELS = [
  'meta-llama/Llama-2-7b-chat-hf',
  'mistralai/Mistral-7B-Instruct-v0.1',
  'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO'
];

function getHF() {
  const token = process.env.HUGGINGFACE_API_TOKEN;
  if (!token) {
    throw new Error('HUGGINGFACE_API_TOKEN is not configured. Get a free token from: https://huggingface.co/settings/tokens');
  }
  return new HfInference(token);
}

function validateModel(model) {
  return ALLOWED_MODELS.includes(model) ? model : 'meta-llama/Llama-2-7b-chat-hf';
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

    let systemPrompt = '';
    let userMessage = '';

    if (activeTab === 'search') {
      systemPrompt = `You are an expert geographer and researcher. Your task is to answer geographical questions accurately.
        ${withExplanation ? 'Provide a detailed, comprehensive explanation in Arabic.' : 'Provide a very concise, direct answer in Arabic WITHOUT any detailed explanation.'}`;
      userMessage = `Answer the following geographical query in Arabic:\n${input}`;
    } else {
      systemPrompt = `You are an expert geography teacher and translator. Your task is to translate geographical terms between English and Arabic.
        DO NOT provide literal translations. Provide the accurate, scientifically accepted geographical term in the target language.
        ${withExplanation ? 'Provide the translation AND a detailed geographical explanation in Arabic.' : 'Provide ONLY the translated term concisely.'}`;
      userMessage = `Translate the following geographical content from ${translationDir === 'en-ar' ? 'English to Arabic' : 'Arabic to English'}:\n${input}`;
    }

    const hf = getHF();

    try {
      const response = await hf.textGeneration({
        model: selectedModel,
        inputs: `${systemPrompt}\n\nUser: ${userMessage}`,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.7,
          top_p: 0.9,
        },
      });

      res.json({
        text: response.generated_text || 'لم يتم الحصول على نتيجة.',
        sources: undefined,
      });
    } catch (primaryError) {
      console.error('Primary model failed, trying fallback...', primaryError);
      const fallbackModel = selectedModel === 'meta-llama/Llama-2-7b-chat-hf' 
        ? 'mistralai/Mistral-7B-Instruct-v0.1' 
        : 'meta-llama/Llama-2-7b-chat-hf';
      
      const response = await hf.textGeneration({
        model: fallbackModel,
        inputs: `${systemPrompt}\n\nUser: ${userMessage}`,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.7,
          top_p: 0.9,
        },
      });

      res.json({
        text: response.generated_text || 'لم يتم الحصول على نتيجة.',
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
    const { originalInput, selectedModel: rawModel } = req.body;
    const selectedModel = validateModel(rawModel);

    const hf = getHF();
    const prompt = `أعطني معاني وترجمات بديلة للنص التالي: "${originalInput}".
      يرجى تضمين:
      1. ترجمة حرفية.
      2. المعنى العام أو الشائع.
      3. المعنى بالعامية المصرية.
      اكتب الرد باختصار وتنسيق واضح في نقاط.`;

    const response = await hf.textGeneration({
      model: selectedModel,
      inputs: `أنت خبير لغوي ومترجم محترف.\n\nUser: ${prompt}`,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.7,
      },
    });

    res.json({ text: response.generated_text });
  } catch (error) {
    console.error('Alternatives API error:', error);
    res.status(500).json({
      error: 'حدث خطأ أثناء جلب المعاني الإضافية.',
    });
  }
});

export default router;
