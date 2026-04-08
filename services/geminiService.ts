
import { GoogleGenAI, Type } from "@google/genai";
import { Question, Difficulty } from "../types";

export const generateQuestions = async (topic: string, count: number, language: string, difficulty: Difficulty): Promise<Question[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `Generate ${count} multiple choice questions for Indian government exam preparation (like UPSC, SSC CGL, Banking, Railway) on the topic: "${topic}". 
  The questions and all options MUST be written in ${language}.
  The difficulty level of the questions MUST be ${difficulty}.
  Each question must have exactly 4 options.
  Provide the output in a JSON format matching the schema.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
    return JSON.parse(jsonStr) as Question[];
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw new Error("Failed to generate test. Please check your connection and try again.");
  }
};
