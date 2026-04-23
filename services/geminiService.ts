
import { GoogleGenAI, Type } from "@google/genai";
import { Question, Difficulty } from "../types";

export const generateQuestions = async (topic: string, count: number, language: string, difficulty: Difficulty): Promise<Question[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Use pro model for large requests to ensure consistency and higher token limits
  const modelName = count > 20 ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";

  const prompt = `You are an expert exam paper setter for Indian government exams (UPSC, SSC CGL, Banking, Railway, SBI PO, etc.).
  Generate EXACTLY ${count} high-quality multiple choice questions on the topic: "${topic}".
  
  STRICT RULES:
  1. Language: All questions and options MUST be in ${language}.
  2. Difficulty: ${difficulty} level.
  3. Format: Each question must have exactly 4 options.
  4. Response: Return ONLY a valid JSON array of objects following the schema. No markdown, no extra text.
  5. Content: Ensure historical/factual accuracy. All questions must be relevant to the topic.
  6. Volume: You must provide all ${count} questions. Do not truncate the list.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
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
              },
              correctAnswerIndex: { type: Type.INTEGER },
            },
            required: ["id", "text", "options", "correctAnswerIndex"],
          },
        },
      },
    });

    const jsonStr = response.text.trim();
    const questions = JSON.parse(jsonStr) as Question[];
    
    console.log(`Generated ${questions.length} questions for topic: ${topic}`);
    
    // If it slightly under-generates, return what we have (better than error)
    // but the model above is instructed to be strict.
    return questions;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    if (error instanceof SyntaxError) {
      throw new Error("The AI returned a malformed response. This can happen with very large tests. Please try again with a more specific topic.");
    }
    throw new Error("Failed to generate test. Please check your connection and try again.");
  }
};
