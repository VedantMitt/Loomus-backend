import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();
router.post("/suggest", authMiddleware, async (req, res) => {
  const { context, query } = req.body;
  
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured on server" });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const prompt = `You are an AI assistant for a social app called Loomus. 
The user is currently looking at: ${context}. 
The user asks: "${query}"
Give a very concise, friendly, and helpful suggestion (max 2 sentences).`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    res.json({ suggestion: text });
  } catch (error) {
    console.error("AI SUGGEST ERROR:", error);
    res.status(500).json({ error: "Failed to generate AI suggestion" });
  }
});

router.get("/hot-events", async (req, res) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }
  
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const prompt = `Generate 4 realistic "hot upcoming events" happening in Delhi in the next 2 to 14 days. Do NOT generate events happening today or right now.
Format exactly as a JSON array of objects with the following schema:
[
  {
    "id": "string",
    "title": "string",
    "location": "string",
    "time": "string (e.g., 'May 28th, 8:00 PM' or 'In 5 days')",
    "type": "string (e.g., 'Concert', 'Comedy')",
    "image": "string (Unsplash image URL related to the event type, use source.unsplash.com or images.unsplash.com)",
    "gradient": "string (RGBA color string like 'rgba(255, 65, 108, 0.4)')"
  }
]
Return ONLY the raw JSON array. Do not include markdown formatting like \`\`\`json.`;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    if (text.startsWith("\`\`\`json")) text = text.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
    if (text.startsWith("\`\`\`")) text = text.replace(/\`\`\`/g, "").trim();
    
    res.json(JSON.parse(text));
  } catch (error) {
    console.error("AI HOT EVENTS ERROR:", error);
    res.status(500).json({ error: "Failed to generate hot events" });
  }
});

export default router;
