
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
      if (
        key && 
        key.length > 15 && 
        !pool.includes(key) && 
        !key.includes('MISSING') &&
        !key.startsWith('AIzaSyBe32')
      ) {
        pool.push(key);
      }
    }
  }

  // Fallback if no valid key found in pool
  if (pool.length === 0 && process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.startsWith('AIzaSyBe32')) {
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

// Clear any legacy cached questions from localStorage to ensure users always get fresh, accurate tests
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("tt_cached_topic_")) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
} catch {}

export const generateQuestions = async (topic: string, count: number, language: string, difficulty: Difficulty): Promise<Question[]> => {
  const safeTopic = (topic && topic.trim()) ? topic.trim() : "General Knowledge (सामान्य ज्ञान)";
  const safeCount = Math.min(Math.max(Number(count) || 10, 1), 100);

  // 1. Always call the server API endpoint for fresh, topic-specific, AI-generated questions
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(`[Gemini Client] Generating ${safeCount} fresh questions for "${safeTopic}" (${language}, ${difficulty})...`);
      const resp = await fetch("/api/questions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: safeTopic, count: safeCount, language, difficulty })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data?.success && Array.isArray(data.questions) && data.questions.length > 0) {
          console.log(`[Gemini Client] Server delivered ${data.questions.length} questions tailored to "${safeTopic}"`);
          return data.questions;
        }
      }
    } catch (netErr) {
      console.warn(`[Gemini Client] Server call attempt ${attempt + 1} failed:`, netErr);
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }

  // 2. Direct fallback using Gemini client if server proxy was completely unreachable
  const pool = getApiKeyPool();
  console.log(`[Gemini Client Fallback] Active API key count: ${pool.length}`);

  const prompt = `CRITICAL DIRECTIVE: You are an expert examination paper setter.
Generate exactly ${safeCount} multiple choice questions strictly and specifically on the topic: "${safeTopic}" in ${language}.
Difficulty level: ${difficulty}.
All 4 options, explanations, and questions must be in ${language}.
Format as JSON array with properties: id (number), text (string), options (4 strings), correctAnswerIndex (0-3), explanation (string), subject ("${safeTopic}").`;

  const config = {
    responseMimeType: "application/json",
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

  const modelsToTry = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.1-flash-lite"];
  const totalAttempts = Math.max(pool.length, 1);
  let lastError: any = null;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const { client, keyIndex, totalKeys } = getNextClient(pool);
    const keyLabel = totalKeys > 1 ? `Key #${keyIndex + 1}/${totalKeys}` : "Default Key";

    for (const modelName of modelsToTry) {
      try {
        console.log(`[Gemini Fallback] Attempting with ${keyLabel} on ${modelName}...`);
        const response = await client.models.generateContent({
          model: modelName,
          contents: prompt,
          config,
        });

        if (response.text) {
          let clean = response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          const questions = JSON.parse(clean) as Question[];
          if (Array.isArray(questions) && questions.length > 0) {
            console.log(`[Gemini Fallback] Success! Generated ${questions.length} questions for "${safeTopic}"`);
            return questions;
          }
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini Fallback] Error with ${keyLabel} on ${modelName}:`, err?.message || err);
      }
    }
  }

  if (isQuotaOrRateLimitError(lastError)) {
    throw new Error(
      "Google AI की सीमा इस समय व्यस्त है। कृपया कुछ सेकंड रुककर पुनः प्रयास करें।"
    );
  }

  throw new Error(lastError instanceof Error ? lastError.message : "Failed to generate test. Please try again.");
};

export const generateAvatar = async (userName: string): Promise<string> => {
  // Return a stylish SVG avatar data URI immediately as reliable fallback
  const initials = (userName || 'User')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'TT';

  const colors = [
    ['#6366f1', '#a855f7'],
    ['#3b82f6', '#06b6d4'],
    ['#10b981', '#059669'],
    ['#f59e0b', '#d97706'],
    ['#ec4899', '#8b5cf6']
  ];
  const charCode = (userName || 'A').charCodeAt(0);
  const [c1, c2] = colors[charCode % colors.length];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="30" fill="url(#grad)" />
    <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/>
    <text x="50" y="58" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="900" fill="#ffffff" text-anchor="middle">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

