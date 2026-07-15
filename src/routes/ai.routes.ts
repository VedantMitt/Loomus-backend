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

    // 2. Fallback to our own database (Loomus users' public events)
    const { rows } = await pool.query(`
      SELECT 
        a.id, 
        a.title, 
        a.location, 
        a.date, 
        a.type, 
        COALESCE(NULLIF(a.banner, ''), 'https://images.unsplash.com/photo-1540039155733-d7696d4eb959?w=600&h=400&fit=crop') AS image
      FROM activities a
      WHERE a.deleted_at IS NULL 
        AND a.date > NOW() 
        AND a.is_public = TRUE
        AND a.type != 'hobby'
      ORDER BY (SELECT COUNT(*) FROM activity_rsvps r WHERE r.activity_id = a.id AND r.status = 'going') DESC, a.date ASC
      LIMIT 10
    `);

    const gradients = [
      "rgba(255, 65, 108, 0.4)",
      "rgba(17, 153, 142, 0.4)",
      "rgba(142, 45, 226, 0.4)",
      "rgba(0, 210, 255, 0.4)",
      "rgba(249, 115, 22, 0.4)",
      "rgba(16, 185, 129, 0.4)"
    ];

    const formattedEvents = rows.map((row, index) => {
      const d = new Date(row.date);
      return {
        id: row.id,
        title: row.title,
        location: row.location,
        time: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        type: row.type || "Event",
        image: row.image,
        gradient: gradients[index % gradients.length]
      };
    });

    res.json(formattedEvents);
  } catch (error) {
    console.error("HOT EVENTS ERROR:", error);
    res.status(500).json({ error: "Failed to fetch hot events" });
  }
});

export default router;
