import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function run() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      tools: [{ googleSearch: {} }] as any,
    });
    const prompt = "What are the top 5 upcoming events in Delhi this week? Provide a JSON array with title, location, and time.";
    const result = await model.generateContent(prompt);
    console.log(result.response.text());
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
run();
