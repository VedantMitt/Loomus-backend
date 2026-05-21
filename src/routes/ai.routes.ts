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
  // Free tier Gemini rate-limits are too strict and District/BMS blocks direct scraping.
  // We use a pool of REAL 2026 events scraped manually from District.in and BookMyShow.
  const REAL_2026_EVENTS = [
    {
      id: "real_1",
      title: "Bars by Rolling Loud",
      location: "Auro Kitchen Bar, Hauz Khas",
      time: "May 23rd, 8:00 PM",
      type: "Music",
      image: "https://images.unsplash.com/photo-1493225457124-a1a2a5f5f92e?w=600&h=400&fit=crop",
      gradient: "rgba(220, 38, 38, 0.4)"
    },
    {
      id: "real_2",
      title: "India-Africa Dance Fest",
      location: "Bharat Mandapam",
      time: "May 23rd, 5:00 PM",
      type: "Cultural",
      image: "https://images.unsplash.com/photo-1533174000255-14eb022f4dc2?w=600&h=400&fit=crop",
      gradient: "rgba(234, 179, 8, 0.4)"
    },
    {
      id: "real_3",
      title: "Kendra Dance Festival 2026",
      location: "Kamani Auditorium",
      time: "May 25th, 6:30 PM",
      type: "Dance",
      image: "https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=600&h=400&fit=crop",
      gradient: "rgba(59, 130, 246, 0.4)"
    },
    {
      id: "real_4",
      title: "Future Funk: One Year Dance",
      location: "AURO, Hauz Khas",
      time: "May 22nd, 9:00 PM",
      type: "Party",
      image: "https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&h=400&fit=crop",
      gradient: "rgba(168, 85, 247, 0.4)"
    },
    {
      id: "real_5",
      title: "TOXIC - Abhishek Upmanyu Live",
      location: "Siri Fort Auditorium",
      time: "May 26th, 7:00 PM",
      type: "Comedy",
      image: "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600&h=400&fit=crop",
      gradient: "rgba(16, 185, 129, 0.4)"
    },
    {
      id: "real_6",
      title: "Gaurav Kapoor Live",
      location: "Kedarnath Sahni Auditorium",
      time: "May 28th, 8:00 PM",
      type: "Comedy",
      image: "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600&h=400&fit=crop",
      gradient: "rgba(249, 115, 22, 0.4)"
    },
    {
      id: "real_7",
      title: "Footloose Run 2026",
      location: "JLN Stadium",
      time: "May 24th, 5:30 AM",
      type: "Sports",
      image: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&h=400&fit=crop",
      gradient: "rgba(6, 182, 212, 0.4)"
    }
  ];

  try {
    // Shuffle and pick 4
    const shuffled = [...REAL_2026_EVENTS].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 4);
    res.json(selected);
  } catch (error) {
    console.error("HOT EVENTS ERROR:", error);
    res.status(500).json({ error: "Failed to fetch hot events" });
  }
});

export default router;
