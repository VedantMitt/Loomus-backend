require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
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
    console.log("RAW TEXT:", text);
    
    if (text.startsWith("\`\`\`json")) text = text.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
    if (text.startsWith("\`\`\`")) text = text.replace(/\`\`\`/g, "").trim();
    
    console.log("PARSED JSON:", JSON.parse(text));
  } catch (error) {
    console.error("ERROR:", error.message);
  }
}
run();
