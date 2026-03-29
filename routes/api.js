import { Router } from 'express';
import { HfInference } from '@huggingface/inference';

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
    const { input, activeTab, translationDir, selectedModel: rawModel } = req.body;
    const selectedModel = validateModel(rawModel);

    const hf = getHF();

    if (activeTab === 'search') {
      // For search, provide a simple geographic answer
      // In production, you might want to use a search API here
      res.json({
        text: `جغرافيا: ${input}`,
        sources: undefined,
      });
    } else {
      // For translation, use NLLB model
      const srcLang = translationDir === 'en-ar' ? 'eng_Latn' : 'ara_Arab';
      const tgtLang = translationDir === 'en-ar' ? 'ara_Arab' : 'eng_Latn';

      const response = await hf.translation({
        model: selectedModel,
        inputs: input,
        parameters: {
          src_lang: srcLang,
          tgt_lang: tgtLang,
        },
      });

      res.json({
        text: response[0]?.translation_text || 'لم يتم الحصول على ترجمة.',
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
    const { originalInput, selectedModel: rawModel, translationDir } = req.body;
    const selectedModel = validateModel(rawModel);

    const hf = getHF();
    const srcLang = translationDir === 'en-ar' ? 'eng_Latn' : 'ara_Arab';
    const tgtLang = translationDir === 'en-ar' ? 'ara_Arab' : 'eng_Latn';

    // Get primary translation
    const primaryResponse = await hf.translation({
      model: selectedModel,
      inputs: originalInput,
      parameters: {
        src_lang: srcLang,
        tgt_lang: tgtLang,
      },
    });

    const primaryTranslation = primaryResponse[0]?.translation_text || '';

    // Fallback model for alternatives
    const fallbackModel = selectedModel === 'facebook/nllb-200-distilled-600M'
      ? 'facebook/nllb-200-1.3B'
      : 'facebook/nllb-200-distilled-600M';

    const fallbackResponse = await hf.translation({
      model: fallbackModel,
      inputs: originalInput,
      parameters: {
        src_lang: srcLang,
        tgt_lang: tgtLang,
      },
    });

    const alternativeTranslation = fallbackResponse[0]?.translation_text || '';

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
