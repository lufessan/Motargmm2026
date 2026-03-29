import { Router } from 'express';
import { HfInference } from '@huggingface/inference';
import { GoogleGenAI } from '@google/genai';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

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

function getGemini() {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured. Set GEMINI_API_KEY environment variable.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: baseURL ? { apiVersion: '', baseUrl: baseURL } : undefined,
  });
}

function validateModel(model) {
  return ALLOWED_MODELS.includes(model) ? model : 'Qwen/Qwen2.5-72B-Instruct';
}

async function extractTextFromImage(imageBase64) {
  try {
    const ai = getGemini();
    const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, '');
    const mimeMatch = imageBase64.match(/^data:(image\/[^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              },
            },
            {
              text: 'Extract ALL text visible in this image. Include every word, title, label, caption, and paragraph you can see. Preserve the original language (English, Arabic, or both). Return ONLY the extracted text, nothing else.',
            },
          ],
        },
      ],
    });

    const text = response.text || '';
    console.log(`Gemini Vision: extracted ${text.length} chars from image`);
    return text.substring(0, 100000);
  } catch (error) {
    console.error('Gemini Vision Error:', error);
    throw new Error('Failed to extract text from image');
  }
}

async function extractTextFromPDF(pdfBase64) {
  let parser = null;
  try {
    const base64Data = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    parser = new PDFParse({ verbosity: 0 });
    await parser.load(buffer);
    const result = await parser.getText();
    const text = typeof result === 'object' ? result.text : result;
    const trimmed = (text || '').replace(/\n-- \d+ of \d+ --\n/g, '\n').trim();
    console.log(`PDF: extracted ${trimmed.length} chars`);
    return trimmed.substring(0, 100000);
  } catch (error) {
    console.error('PDF Error:', error);
    throw new Error('Failed to extract text from PDF');
  } finally {
    if (parser) {
      try { parser.destroy(); } catch (_) {}
    }
  }
}

async function extractTextFromFile(fileData, fileType) {
  if (fileType === 'application/pdf') {
    return await extractTextFromPDF(fileData);
  } else if (fileType.startsWith('image/')) {
    return await extractTextFromImage(fileData);
  }
  return null;
}

async function callModel(hf, model, prompt) {
  const inputLen = prompt.length;
  const maxTokens = inputLen > 10000 ? 4000 : 1500;
  const result = await hf.chatCompletion({
    model: model,
    messages: [{ role: 'user', content: prompt.substring(0, 95000) }],
    max_tokens: maxTokens,
  });
  return result.choices?.[0]?.message?.content || '';
}

const NO_CHINESE = 'تحذير مهم: يجب أن يكون الرد بالعربية فقط. لا تستخدم أي لغة أخرى غير العربية والإنجليزية. ممنوع الصينية أو أي لغة آسيوية.';

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
    const { input, activeTab, translationDir, withExplanation, selectedModel: rawModel, files } = req.body;
    const selectedModel = validateModel(rawModel);

    let textToProcess = input.substring(0, 90000);
    let fileExtractedText = null;

    if (files && files.length > 0) {
      console.log('Processing file...');
      try {
        const file = files[0];
        const extractedText = await extractTextFromFile(file.data, file.type);
        if (extractedText) {
          fileExtractedText = extractedText;
          textToProcess = extractedText;
          console.log(`Extracted ${textToProcess.length} chars from file`);
        }
      } catch (fileError) {
        console.error('File processing failed, using input text instead:', fileError);
      }
    }

    const hf = getHF();
    let prompt = '';

    if (activeTab === 'search') {
      if (fileExtractedText) {
        prompt = `${NO_CHINESE}\n\nفيما يلي نص مستخرج من ملف أو صورة:\n\n${textToProcess}\n\nالمطلوب: ${input || 'قم بتحليل وشرح هذا المحتوى الجغرافي باللغة العربية'}`;
      } else {
        prompt = `${NO_CHINESE}\n\nأجب على هذا السؤال الجغرافي باللغة العربية باختصار: ${textToProcess}`;
      }
    } else {
      if (fileExtractedText) {
        if (translationDir === 'en-ar') {
          prompt = `${NO_CHINESE}\n\nأنت مترجم جغرافي متخصص. فيما يلي نص مستخرج من صورة أو ملف. ترجم جميع المصطلحات الجغرافية الموجودة فيه إلى العربية بشكل مفهوم وسهل، مع وضع المصطلح الأكاديمي بين قوسين.${withExplanation ? ' أضف شرحاً تفصيلياً لكل مصطلح.' : ''}\n\nالنص المستخرج:\n${textToProcess}\n\nالترجمة${withExplanation ? ' والشرح' : ''}:`;
        } else {
          prompt = `You are an expert geographic translator. Below is text extracted from an image or file. Translate all Arabic geographic terms found in it to English.${withExplanation ? ' Include a clear explanation for each term.' : ' Give only the translations.'} Answer ONLY in English and Arabic, no other languages.\n\nExtracted text:\n${textToProcess}\n\nTranslation${withExplanation ? ' and Explanation' : ''}:`;
        }
      } else {
        if (translationDir === 'en-ar') {
          if (withExplanation) {
            prompt = `${NO_CHINESE}\n\nأنت مترجم جغرافي متخصص. ترجم المصطلح الجغرافي التالي إلى العربية بشكل مفهوم وسهل، مع وضع المصطلح الأكاديمي بين قوسين، ثم أضف شرحاً تفصيلياً للمصطلح باللغة العربية فقط.\n\nمثال:\nlandform = أشكال سطح الأرض (التضاريس)\nالشرح: هي الأشكال والمعالم الطبيعية التي تتكون على سطح الأرض نتيجة العوامل الداخلية كالبراكين والزلازل والعوامل الخارجية كالتعرية والترسيب، وتشمل الجبال والسهول والهضاب والوديان.\n\nالمصطلح: ${textToProcess}\nالترجمة والشرح:`;
          } else {
            prompt = `${NO_CHINESE}\n\nأنت مترجم جغرافي متخصص. ترجم المصطلح الجغرافي التالي إلى العربية بشكل مفهوم وسهل، مع وضع المصطلح الأكاديمي بين قوسين. أعط الترجمة فقط بدون أي شرح أو نص إنجليزي.\n\nأمثلة:\nlandform = أشكال سطح الأرض (التضاريس)\ncontinental shelf = الجرف القاري (الرصيف القاري)\nerosion = عوامل تآكل سطح الأرض (التعرية)\nplateau = المنطقة المرتفعة المسطحة (الهضبة)\n\nالمصطلح: ${textToProcess}\nالترجمة:`;
          }
        } else {
          if (withExplanation) {
            prompt = `You are an expert geographic translator. Translate the following Arabic geographic term to English with a clear explanation. Answer ONLY in English and Arabic, no other languages.\n\nExample:\nالتضاريس = Landforms\nExplanation: Natural features of the Earth's surface formed by internal forces like volcanoes and earthquakes, and external forces like erosion and deposition.\n\nTerm: ${textToProcess}\nTranslation and Explanation:`;
          } else {
            prompt = `You are an expert geographic translator. Translate the following Arabic term to English. Give ONLY the translation, no explanations. Answer ONLY in English, no other languages.\n\nTerm: ${textToProcess}\nTranslation:`;
          }
        }
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

    responseText = responseText.replace(/[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}\u{30000}-\u{3134f}\u3000-\u303f\uff00-\uffef]/gu, '').trim();

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

router.post('/extract-text', async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'لم يتم إرفاق أي ملف.' });
    }

    const file = files[0];
    const extractedText = await extractTextFromFile(file.data, file.type);

    if (!extractedText || extractedText.trim().length === 0) {
      return res.json({ text: 'لم يتم العثور على نصوص في هذا الملف.' });
    }

    res.json({ text: extractedText.trim() });
  } catch (error) {
    console.error('Extract text API error:', error.message);
    res.status(500).json({
      error: 'حدث خطأ أثناء استخراج النصوص. يرجى المحاولة مرة أخرى.',
    });
  }
});

router.post('/alternatives', async (req, res) => {
  try {
    const { originalInput, selectedModel: rawModel, translationDir } = req.body;
    const selectedModel = validateModel(rawModel);
    const textToProcess = originalInput.substring(0, 200);

    const hf = getHF();
    let prompt;
    if (translationDir === 'en-ar') {
      prompt = `${NO_CHINESE}\n\nأعط ترجمتين بديلتين للمصطلح الجغرافي التالي إلى العربية. أعط الترجمات فقط بدون شرح، كل ترجمة في سطر:\n\n${textToProcess}`;
    } else {
      prompt = `Give 2 alternative English translations for this Arabic geographic term. Give only translations, each on a new line. No Chinese or other languages:\n\n${textToProcess}`;
    }

    let responseText = await callModel(hf, selectedModel, prompt);
    responseText = responseText.replace(/[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}\u{30000}-\u{3134f}\u3000-\u303f\uff00-\uffef]/gu, '').trim();

    res.json({ text: responseText || 'لم يتم الحصول على ترجمات بديلة.' });
  } catch (error) {
    console.error('Alternatives API error:', error.message);
    res.status(500).json({
      error: 'حدث خطأ أثناء جلب الترجمات البديلة.',
    });
  }
});

export default router;
