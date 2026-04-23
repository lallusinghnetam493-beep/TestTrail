
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { Question, Difficulty } from "../types";

export const generateQuestions = async (topic: string, count: number, language: string, difficulty: Difficulty): Promise<Question[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Use Flash model for all requests. 
  // It is faster and more reliable for returning structured JSON at all volumes.
  const modelName = "gemini-3-flash-preview";

  const systemInstruction = `You are an expert exam paper setter for Indian government exams (UPSC, SSC CGL, Banking, Railway, SBI PO, etc.).
  Your task is to generate high-quality, factually accurate multiple choice questions.
  
  STRICT CONSTRAINTS:
  1. Quantity: You MUST generate EXACTLY the number of questions requested (${count}).
  2. Language: All content MUST be in ${language}.
  3. Difficulty: Adaptive ${difficulty} level.
  4. Accuracy: All facts must be 100% accurate.
  5. Format: Return ONLY a valid JSON array of objects.
  6. Conciseness: Keep question text and options clear and brief to ensure the response fits within limits.`;

  const prompt = `Generate exactly ${count} multiple choice questions about "${topic}" in ${language}. Focus on breadth and depth suitable for ${difficulty} difficulty.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction,
        seed: 42,
        responseMimeType: "application/json",
        // Increase output tokens for 100 questions (especially in Hindi which uses more tokens)
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
            },
            required: ["id", "text", "options", "correctAnswerIndex"],
          },
        },
      },
    });

    if (!response.text) {
      throw new Error("The AI didn't return any questions. This can happen with very large requests. Please try a more specific topic or shorter count.");
    }

    const jsonStr = response.text.trim();
    const questions = JSON.parse(jsonStr) as Question[];
    
    console.log(`Generated ${questions.length} questions for topic: ${topic}`);
    
    if (questions.length < count * 0.8) {
      console.warn(`Generated only ${questions.length}/${count} questions.`);
    }

    return questions;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    if (error instanceof SyntaxError) {
      throw new Error("The response was truncated due to its large size. Please try again with a more specific topic or 50 questions for best results.");
    }
    throw new Error(error instanceof Error ? error.message : "Failed to generate test. Please check your connection.");
  }
};
