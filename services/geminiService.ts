
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { Question, Difficulty } from "../types";

/**
 * Retrieves all available Gemini API keys from environment variables.
 * Supports:
 * - GEMINI_API_KEY
 * - GEMINI_API_KEY_2
 * - GEMINI_API_KEY_3
 * - Comma/semicolon/newline-separated keys in any of the above
 */
export function getApiKeyPool(): string[] {
  const rawSources = [
    process.env.GEMINI_API_KEY || '',
    (process.env as any).GEMINI_API_KEY_2 || '',
    (process.env as any).GEMINI_API_KEY_3 || '',
    process.env.API_KEY || '',
  ];

  const pool: string[] = [];
  for (const raw of rawSources) {
    if (!raw) continue;
    const parts = raw.split(/[\n,;]+/).map(k => k.trim()).filter(Boolean);
    for (const key of parts) {
      if (key && key.length > 15 && !pool.includes(key) && !key.includes('MISSING')) {
        pool.push(key);
      }
    }
  }

  // Fallback if no valid key found in pool
  if (pool.length === 0 && process.env.GEMINI_API_KEY) {
    pool.push(process.env.GEMINI_API_KEY.trim());
  }

  return pool;
}

let activeKeyIndex = 0;

function getNextClient(pool: string[]): { client: GoogleGenAI; keyIndex: number; totalKeys: number } {
  if (pool.length === 0) {
    return { client: new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), keyIndex: 0, totalKeys: 0 };
  }
  const keyIndex = activeKeyIndex % pool.length;
  activeKeyIndex = (activeKeyIndex + 1) % pool.length;
  return {
    client: new GoogleGenAI({ apiKey: pool[keyIndex] }),
    keyIndex,
    totalKeys: pool.length
  };
}

function isQuotaOrRateLimitError(error: any): boolean {
  if (!error) return false;
  const str = typeof error === 'object' ? (error.message || JSON.stringify(error)) : String(error);
  return (
    str.includes("429") ||
    str.includes("RESOURCE_EXHAUSTED") ||
    str.includes("quota") ||
    str.includes("rate-limit") ||
    str.includes("Rate Limit") ||
    str.includes("Too Many Requests")
  );
}

// Lightweight cache to reuse generated questions and save API quota
const CACHE_PREFIX = "tt_cached_topic_";
function getCachedQuestions(topic: string, language: string, difficulty: Difficulty): Question[] | null {
  try {
    const key = `${CACHE_PREFIX}${topic.toLowerCase().trim()}_${language}_${difficulty}`;
    const item = localStorage.getItem(key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    if (Array.isArray(parsed) && parsed.length > 0) {
      console.log(`[Cache Hit] Reusing ${parsed.length} cached questions for "${topic}"`);
      return parsed;
    }
  } catch {
    // Ignore cache parse errors
  }
  return null;
}

function saveCachedQuestions(topic: string, language: string, difficulty: Difficulty, questions: Question[]) {
  try {
    if (!questions || questions.length === 0) return;
    const key = `${CACHE_PREFIX}${topic.toLowerCase().trim()}_${language}_${difficulty}`;
    localStorage.setItem(key, JSON.stringify(questions));
  } catch {
    // LocalStorage full or private mode, safely ignore
  }
}

export const generateQuestions = async (topic: string, count: number, language: string, difficulty: Difficulty): Promise<Question[]> => {
  const pool = getApiKeyPool();
  console.log(`[Gemini Pool] Active API key count: ${pool.length}`);

  const systemInstruction = `You are an expert exam paper setter for Indian government exams (UPSC, SSC CGL, Banking, Railway, SBI PO, etc.).
  Your task is to generate high-quality, factually accurate multiple choice questions.
  
  STRICT CONSTRAINTS:
  1. Quantity: You MUST generate EXACTLY the number of questions requested (${count}).
  2. Language: All content MUST be in ${language}.
  3. Difficulty: Adaptive ${difficulty} level.
  4. Accuracy: All facts must be 100% accurate.
  5. Explanations: Provide a CLEAR, HELPFUL explanation for the correct answer (max 30 words).
  6. Subject: Categorize each question into a relevant subject (e.g., Mathematics, History, Science, Reasoning).
  7. Format: Return ONLY a valid JSON array of objects.
  8. Conciseness: Keep question text and options clear and brief.
  9. Language: Generate content in ${language}. If Hindi is requested, provide both the text and explanation in Hindi.
  `;

  const prompt = `Generate exactly ${count} multiple choice questions about "${topic}" in ${language}. For each question, include a 'subject' and an 'explanation'. Focus on breadth and depth suitable for ${difficulty} difficulty.`;

  const config = {
    systemInstruction,
    seed: 42,
    responseMimeType: "application/json",
    maxOutputTokens: 20000,
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          text: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            minItems: 4,
            maxItems: 4
          },
          correctAnswerIndex: { type: Type.INTEGER },
          explanation: { type: Type.STRING },
          subject: { type: Type.STRING },
        },
        required: ["id", "text", "options", "correctAnswerIndex", "explanation", "subject"],
      },
    },
  };

  const modelsToTry = ["gemini-3.8-flash", "gemini-2.5-flash-lite"];
  const totalAttempts = Math.max(pool.length, 1);
  let lastError: any = null;

  // 1. Try across all available API keys in the pool
  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const { client, keyIndex, totalKeys } = getNextClient(pool);
    const keyLabel = totalKeys > 1 ? `Key #${keyIndex + 1}/${totalKeys}` : "Default Key";

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Gemini] Attempting question generation with ${keyLabel} using model ${modelName}...`);
        const response = await client.models.generateContent({
          model: modelName,
          contents: prompt,
          config,
        });

        if (!response.text) {
          throw new Error("AI returned an empty response. Trying fallback...");
        }

        const jsonStr = response.text.trim();
        const questions = JSON.parse(jsonStr) as Question[];
        console.log(`[Gemini] Success! Generated ${questions.length} questions using ${keyLabel}`);

        // Save into cache for future instant reuse
        saveCachedQuestions(topic, language, difficulty, questions);
        return questions;

      } catch (err: any) {
        lastError = err;
        const isQuota = isQuotaOrRateLimitError(err);
        console.warn(`[Gemini] Error with ${keyLabel} on ${modelName}:`, err.message || err);

        if (isQuota) {
          console.warn(`[Gemini Pool] ${keyLabel} hit rate limit. Switching to next API key...`);
          // Break model loop to switch immediately to the next API key in pool
          break;
        } else if (err instanceof SyntaxError) {
          // Truncation or parse error, let's continue to next attempt or throw
          break;
        }
      }
    }
  }

  // 2. If all keys were rate limited, check if we have cached questions as emergency fallback
  const cached = getCachedQuestions(topic, language, difficulty);
  if (cached && cached.length >= count) {
    console.log(`[Gemini] Serving ${count} questions from offline cache due to rate limits`);
    return cached.slice(0, count);
  }

  // 3. User friendly message if all keys are exhausted
  console.error("All Gemini API keys failed:", lastError);
  if (isQuotaOrRateLimitError(lastError)) {
    const keyCount = pool.length;
    throw new Error(
      keyCount > 1
        ? `सभी ${keyCount} Google AI Keys की फ़्री लिमिट (Rate Limit: 429) इस समय पूरी हो गई है। कृपया 1-2 मिनट रुककर पुनः प्रयास करें या Settings में अतिरिक्त API Keys जोड़ें।`
        : `Google AI की फ्री लिमिट (Rate Limit: 429) पूरी हो गई है। आप Settings में 'GEMINI_API_KEY_2' और 'GEMINI_API_KEY_3' जोड़कर अपनी क्षमता 3 गुना बढ़ा सकते हैं!`
    );
  }

  if (lastError instanceof SyntaxError) {
    throw new Error("The response was truncated due to its large size. Please try again with a more specific topic or 50 questions for best results.");
  }

  throw new Error(lastError instanceof Error ? lastError.message : "Failed to generate test. Please check your connection.");
};

export const generateAvatar = async (userName: string): Promise<string> => {
  const pool = getApiKeyPool();
  const prompt = `A professional, clean, minimalist 3D isometric avatar for a competitive exam aspirant named ${userName}. Style: Modern, tech-focused, vibrant colors (indigo/purple), studio lighting, high quality 3D render.`;

  const totalAttempts = Math.max(pool.length, 1);
  let lastErr: any = null;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const { client } = getNextClient(pool);
    try {
      const response = await client.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [{ text: prompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
        },
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (err) {
      lastErr = err;
      console.warn("[Gemini Avatar] Key error, trying next key...", err);
    }
  }

  console.error("Avatar Generation Error:", lastErr);
  throw new Error("Failed to generate AI avatar. Please try again.");
};

