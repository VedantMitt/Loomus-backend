import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authMiddleware } from "../middleware/auth.middleware";
import pool from "../db";
import fs from "fs";
import path from "path";

const router = express.Router();

const CITY_FALLBACKS: Record<string, any[]> = {
  mumbai: [
    {
      id: "mum_1",
      title: "Sunburn Arena / Live Concert",
      location: "Jio World Garden, BKC, Mumbai",
      time: "This Weekend, 6:00 PM",
      type: "Concert",
      image: "https://images.unsplash.com/photo-1540039155733-d7696d4eb959?w=600&h=400&fit=crop",
      gradient: "rgba(236, 72, 153, 0.4)"
    },
    {
      id: "mum_2",
      title: "Standup Comedy Special",
      location: "The Habitat, Khar, Mumbai",
      time: "Tonight, 8:30 PM",
      type: "Comedy",
      image: "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600&h=400&fit=crop",
      gradient: "rgba(168, 85, 247, 0.4)"
    },
    {
      id: "mum_3",
      title: "Marine Drive Sunset Walk & Jam",
      location: "Marine Drive Promenade, Mumbai",
      time: "Today, 5:30 PM",
      type: "Meetup",
      image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop",
      gradient: "rgba(59, 130, 246, 0.4)"
    },
    {
      id: "mum_4",
      title: "Bandra Food & Cafe Crawl",
      location: "Pali Hill, Bandra West, Mumbai",
      time: "Tomorrow, 4:00 PM",
      type: "Food",
      image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=400&fit=crop",
      gradient: "rgba(245, 158, 11, 0.4)"
    }
  ],
  faridabad: [
    {
      id: "fbd_1",
      title: "Surajkund Cultural & Craft Fest",
      location: "Surajkund Mela Grounds, Faridabad",
      time: "This Weekend, 11:00 AM",
      type: "Festival",
      image: "https://images.unsplash.com/photo-1533174000255-14eb022f4dc2?w=600&h=400&fit=crop",
      gradient: "rgba(245, 158, 11, 0.4)"
    },
    {
      id: "fbd_2",
      title: "Aravalli Hill Sunset Cycling",
      location: "Badkhal Lake / Aravalli Hills, Faridabad",
      time: "Tomorrow, 6:00 AM",
      type: "Fitness",
      image: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&h=400&fit=crop",
      gradient: "rgba(16, 185, 129, 0.4)"
    },
    {
      id: "fbd_3",
      title: "Live Acoustic & Unplugged Night",
      location: "Sector 16 / Town Park, Faridabad",
      time: "Tonight, 7:30 PM",
      type: "Concert",
      image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&h=400&fit=crop",
      gradient: "rgba(236, 72, 153, 0.4)"
    },
    {
      id: "fbd_4",
      title: "Sector 15 Street Food Night",
      location: "Market Sector 15, Faridabad",
      time: "Today, 7:00 PM",
      type: "Food",
      image: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=400&fit=crop",
      gradient: "rgba(168, 85, 247, 0.4)"
    }
  ],
  bangalore: [
    {
      id: "blr_1",
      title: "Indiranagar Live Indie Gig",
      location: "Fandom at Gilly's, Koramangala, Bengaluru",
      time: "Tonight, 8:00 PM",
      type: "Concert",
      image: "https://images.unsplash.com/photo-1540039155733-d7696d4eb959?w=600&h=400&fit=crop",
      gradient: "rgba(236, 72, 153, 0.4)"
    },
    {
      id: "blr_2",
      title: "Cubbon Park Weekend Jam & Board Games",
      location: "Cubbon Park, Bengaluru",
      time: "Sunday, 9:00 AM",
      type: "Meetup",
      image: "https://images.unsplash.com/photo-1533174000255-14eb022f4dc2?w=600&h=400&fit=crop",
      gradient: "rgba(16, 185, 129, 0.4)"
    },
    {
      id: "blr_3",
      title: "Church Street Art & Book Walk",
      location: "Church Street, Bengaluru",
      time: "Saturday, 4:00 PM",
      type: "Culture",
      image: "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600&h=400&fit=crop",
      gradient: "rgba(59, 130, 246, 0.4)"
    },
    {
      id: "blr_4",
      title: "Tech Founders & Builders Open House",
      location: "HSR Layout Sector 4, Bengaluru",
      time: "Friday, 6:30 PM",
      type: "Networking",
      image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&h=400&fit=crop",
      gradient: "rgba(168, 85, 247, 0.4)"
    }
  ],
  delhi: [
    {
      id: "del_1",
      title: "Live Concert & Music Night",
      location: "JLN Stadium, Delhi",
      time: "Tonight, 7:00 PM",
      type: "Concert",
      image: "https://images.unsplash.com/photo-1540039155733-d7696d4eb959?w=600&h=400&fit=crop",
      gradient: "rgba(255, 65, 108, 0.4)"
    },
    {
      id: "del_2",
      title: "Standup Comedy Open Mic",
      location: "Hauz Khas Social, Delhi",
      time: "Live Now",
      type: "Comedy",
      image: "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600&h=400&fit=crop",
      gradient: "rgba(17, 153, 142, 0.4)"
    },
    {
      id: "del_3",
      title: "Street Dance & Jam Battle",
      location: "Connaught Place, Inner Circle",
      time: "8:00 PM",
      type: "Dance",
      image: "https://images.unsplash.com/photo-1535592201833-53b47814b7e8?w=600&h=400&fit=crop",
      gradient: "rgba(142, 45, 226, 0.4)"
    },
    {
      id: "del_4",
      title: "Midnight Run & Cycling Fest",
      location: "India Gate, New Delhi",
      time: "11:30 PM",
      type: "Fitness",
      image: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=600&h=400&fit=crop",
      gradient: "rgba(0, 210, 255, 0.4)"
    }
  ]
};

// In-memory cache for generated city events
const cityEventsCache: Record<string, { events: any[]; timestamp: number }> = {};

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
  const userLoc = ((req.query.location || req.query.city || "") as string).trim().toLowerCase();

  // Check matching city
  let matchedKey = "";
  if (userLoc.includes("mumbai") || userLoc.includes("bombay") || userLoc.includes("thane") || userLoc.includes("navi mumbai") || userLoc.includes("bandra")) {
    matchedKey = "mumbai";
  } else if (userLoc.includes("faridabad") || userLoc.includes("badkhal") || userLoc.includes("ballabgarh")) {
    matchedKey = "faridabad";
  } else if (userLoc.includes("bangalore") || userLoc.includes("bengaluru") || userLoc.includes("koramangala") || userLoc.includes("indiranagar")) {
    matchedKey = "bangalore";
  } else if (userLoc.includes("delhi") || userLoc.includes("noida") || userLoc.includes("gurugram") || userLoc.includes("gurgaon")) {
    matchedKey = "delhi";
  }

  // Check cached generated events
  const cacheKey = matchedKey || (userLoc ? userLoc.slice(0, 20) : "default");
  const cached = cityEventsCache[cacheKey];
  if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour cache
    return res.json(cached.events);
  }

  // If Gemini API is available and custom location provided, generate realistic events for that city
  if (process.env.GEMINI_API_KEY && userLoc && userLoc !== "current location") {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
      const prompt = `Generate 4 exciting upcoming social events / concerts / meetups happening in or around "${userLoc}".
Return a strict JSON array with exactly 4 objects:
[
  {
    "id": "gen_1",
    "title": "Short catchy event title",
    "location": "Real venue or neighborhood in ${userLoc}",
    "time": "e.g. Tonight, 8:00 PM or This Saturday, 5:00 PM",
    "type": "Concert / Comedy / Food / Meetup / Fitness",
    "image": "https://images.unsplash.com/photo-1540039155733-d7696d4eb959?w=600&h=400&fit=crop",
    "gradient": "rgba(236, 72, 153, 0.4)"
  }
]
Do NOT use markdown code blocks or extra text, just raw valid JSON.`;

      const aiRes = await model.generateContent(prompt);
      const cleaned = aiRes.response.text().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cityEventsCache[cacheKey] = { events: parsed, timestamp: Date.now() };
        return res.json(parsed);
      }
    } catch (aiErr) {
      console.warn("AI city event generation fallback:", aiErr);
    }
  }

  // Fallback to static city curated lists
  if (matchedKey && CITY_FALLBACKS[matchedKey]) {
    return res.json(CITY_FALLBACKS[matchedKey]);
  }

  // Generic fallback from external_events.json or default
  try {
    const CACHE_FILE = path.join(process.cwd(), "external_events.json");
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        return res.json(data.slice(0, 4));
      }
    }
  } catch (err) {}

  return res.json(CITY_FALLBACKS.delhi);
});

export default router;
