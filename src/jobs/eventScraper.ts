import cron from "node-cron";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

const CACHE_FILE = path.join(__dirname, "../../external_events.json");

// Define the scraper function
export async function scrapeExternalEvents() {
  console.log("🔍 Running daily event scraper (AI Powered)...");
  
  const fallbackEvents = [
    {
      id: "ext_" + Date.now() + "_1",
      title: "Diljit Dosanjh - Dil-Luminati Tour",
      location: "JLN Stadium, Delhi",
      time: "Oct 26th, 7:00 PM",
      type: "Concert",
      image: "https://images.unsplash.com/photo-1540039155733-d7696d4eb959?w=600&h=400&fit=crop",
      gradient: "rgba(220, 38, 38, 0.4)",
      source: "external"
    },
    {
      id: "ext_" + Date.now() + "_2",
      title: "Delhi Food Truck Festival",
      location: "Jawaharlal Nehru Stadium",
      time: "Aug 15th, 4:00 PM",
      type: "Food",
      image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=400&fit=crop",
      gradient: "rgba(234, 179, 8, 0.4)",
      source: "external"
    },
    {
      id: "ext_" + Date.now() + "_3",
      title: "Zomaland by Zomato",
      location: "Pragati Maidan",
      time: "Sep 2nd, 12:00 PM",
      type: "Festival",
      image: "https://images.unsplash.com/photo-1533174000255-14eb022f4dc2?w=600&h=400&fit=crop",
      gradient: "rgba(59, 130, 246, 0.4)",
      source: "external"
    },
    {
      id: "ext_" + Date.now() + "_4",
      title: "Standup Comedy Night",
      location: "Habitat Centre",
      time: "Aug 10th, 8:00 PM",
      type: "Comedy",
      image: "https://images.unsplash.com/photo-1585699324551-f6c309eedeca?w=600&h=400&fit=crop",
      gradient: "rgba(16, 185, 129, 0.4)",
      source: "external"
    }
  ];

  try {
    if (!process.env.GEMINI_API_KEY) {
      console.warn("⚠️ GEMINI_API_KEY is not set. Using fallback events for scraper.");
      fs.writeFileSync(CACHE_FILE, JSON.stringify(fallbackEvents, null, 2));
      return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // We use gemini-1.5-pro as it has superior search capabilities
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro",
      tools: [{ googleSearch: {} }] // Enable Google Search Grounding
    });

    const prompt = `
      Search the web for top upcoming events happening in Delhi NCR this week or month.
      Look for major concerts, standup comedy shows, food festivals, and large public meetups.
      Return the results as a strict JSON array containing exactly 4 events. 
      DO NOT include markdown formatting or backticks like \`\`\`json. Just return the raw JSON array.
      Use this exact JSON schema for each object in the array:
      {
        "id": "ext_timestamp_index", (generate a unique id starting with ext_)
        "title": "Event Name",
        "location": "Event Venue",
        "time": "Date and Time",
        "type": "Concert/Comedy/Festival/Food/etc",
        "image": "Use a generic highly relevant unsplash image URL for the event type (e.g. concert crowd for music)",
        "gradient": "rgba(r,g,b,0.4)", (pick a suitable color based on the vibe)
        "source": "external"
      }
    `;

    const result = await model.generateContent(prompt);
    let text = result.response.text();
    
    // Clean up potential markdown formatting from the response
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const fetchedEvents = JSON.parse(text);

    if (Array.isArray(fetchedEvents) && fetchedEvents.length > 0) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(fetchedEvents, null, 2));
      console.log("✅ Successfully scraped and updated external events cache via AI.");
    } else {
      throw new Error("Parsed AI response is not an array or is empty.");
    }

  } catch (err) {
    console.error("❌ Failed to scrape external events via AI, using fallback:", err);
    // If the file doesn't exist, create it with fallback data so the app doesn't break
    if (!fs.existsSync(CACHE_FILE)) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(fallbackEvents, null, 2));
    }
  }
}

// Schedule to run every day at 2:00 AM
export function initCronJobs() {
  console.log("⏰ Initializing daily cron jobs...");
  
  // Run immediately on startup once so we have data
  scrapeExternalEvents();

  // Run daily at 02:00
  cron.schedule("0 2 * * *", () => {
    scrapeExternalEvents();
  });
}
