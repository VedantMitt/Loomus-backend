import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authMiddleware } from "../middleware/auth.middleware";
import pool from "../db";
import fs from "fs";
import path from "path";

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
  try {
    // 1. Try to fetch from daily scraped cache
    const CACHE_FILE = path.join(__dirname, "../../../external_events.json");
    if (fs.existsSync(CACHE_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
        if (Array.isArray(data) && data.length > 0) {
          // Shuffle them just to keep it fresh
          const shuffled = data.sort(() => 0.5 - Math.random()).slice(0, 4);
          return res.json(shuffled);
        }
      } catch (err) {
        console.error("Failed to read external events cache:", err);
      }
    }

    // If no external events exist, return empty array so frontend falls back to default TOP_LIVE_EVENTS
    return res.json([]);
  } catch (error) {
    console.error("HOT EVENTS ERROR:", error);
    res.status(500).json({ error: "Failed to fetch hot events" });
  }
});

export default router;
