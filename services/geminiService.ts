
import { Question, Difficulty } from "../types";

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

export const generateQuestions = async (
  topic: string, 
  count: number, 
  language: string, 
  difficulty: Difficulty
): Promise<Question[]> => {
  const safeTopic = (topic && topic.trim()) ? topic.trim() : "General Knowledge (सामान्य ज्ञान)";
  const safeCount = Math.min(Math.max(Number(count) || 10, 1), 100);

  let lastErrorMessage = "";

  // Call the server API endpoint for fresh, topic-specific, AI-generated questions
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.log(`[Gemini Client] Generating ${safeCount} fresh questions for "${safeTopic}" (${language}, ${difficulty})...`);
      const resp = await fetch("/api/questions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: safeTopic, count: safeCount, language, difficulty })
      });

      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data?.success && Array.isArray(data.questions) && data.questions.length > 0) {
        console.log(`[Gemini Client] Server delivered ${data.questions.length} questions tailored to "${safeTopic}"`);
        return data.questions;
      }

      if (data?.error) {
        lastErrorMessage = data.error;
      }
    } catch (netErr: any) {
      console.warn(`[Gemini Client] Server call attempt ${attempt + 1} failed:`, netErr);
      lastErrorMessage = netErr?.message || "Network error while connecting to test server.";
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 600));
      }
    }
  }

  throw new Error(
    lastErrorMessage || `"${safeTopic}" विषय पर प्रश्न तैयार करने में समस्या आई। कृपया पुनः प्रयास करें।`
  );
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

