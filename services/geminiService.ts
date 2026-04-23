
import { GoogleGenAI, Type } from "@google/genai";
import { Question, Difficulty } from "../types";

export const generateQuestions = async (topic: string, count: number, language: string, difficulty: Difficulty): Promise<Question[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Use pro model for all requests to ensure maximum quality and token limits for 100 questions
  const modelName = "gemini-3.1-pro-preview";

  const systemInstruction = `You are an expert exam paper setter for Indian government exams (UPSC, SSC CGL, Banking, Railway, SBI PO, etc.).
  Your task is to generate high-quality, factually accurate multiple choice questions.
  
  STRICT CONSTRAINTS:
  1. Quantity: You MUST generate EXACTLY the number of questions requested (${count}).
  2. Language: All content MUST be in ${language}.
  3. Difficulty: Adaptive ${difficulty} level.
  4. Accuracy: All historical, scientific, and atmospheric facts must be 100% accurate.
  5. Format: Return ONLY a valid JSON array of objects.
  6. Persistence: Do not stop or truncate the list. If you need more space, decrease the length of each question text but maintain the count.`;

  const prompt = `Generate exactly ${count} multiple choice questions about "${topic}".`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        // Increase output tokens for 100 questions (approx 150 tokens per question = 15000 tokens)
        // Note: Gemini 3 models have high limits but specifying it helps hit the target.
        maxOutputTokens: 20000,
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
      throw new Error("No response from AI. Please try again.");
    }

    const jsonStr = response.text.trim();
    const questions = JSON.parse(jsonStr) as Question[];
    
    console.log(`Generated ${questions.length} questions for topic: ${topic}`);
    
    return questions;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    if (error instanceof SyntaxError) {
      throw new Error("The AI returned a large but slightly malformed response. This happens due to network limits for 100 questions. Please try again with a more specific topic or 50 questions.");
    }
    throw new Error(error instanceof Error ? error.message : "Failed to generate test. Please check your connection.");
  }
};
