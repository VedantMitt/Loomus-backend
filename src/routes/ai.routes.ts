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
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
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

export default router;
