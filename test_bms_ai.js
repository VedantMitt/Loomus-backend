require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function run() {
  try {
    const res = await fetch('https://in.bookmyshow.com/explore/events-national-capital-region-ncr', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const text = await res.text();
    const matches = text.match(/<script type="application\/ld\+json">(.*?)<\/script>/g);
    let events = [];
    if (matches) {
      for (const m of matches) {
        const inner = m.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, '');
        try {
          const data = JSON.parse(inner);
          if (data['@type'] === 'ItemList' && data.itemListElement) {
            events = data.itemListElement.slice(0, 4);
            break;
          }
        } catch(err) {}
      }
    }
    
    if (events.length === 0) {
      console.log("No events scraped.");
      return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });
    const prompt = `Here are REAL events currently trending on BookMyShow Delhi:
${JSON.stringify(events, null, 2)}

Format them exactly as a JSON array of 4 objects with the following schema:
[
  {
    "id": "string",
    "title": "string (Use the 'name' from the data)",
    "location": "string (Guess a realistic Delhi venue like JLN Stadium, Siri Fort, etc.)",
    "time": "string (e.g., 'May 28th, 8:00 PM')",
    "type": "string (Guess 'Comedy', 'Music', 'Theatre', etc.)",
    "image": "string (Use the EXACT 'image' URL from the data)",
    "gradient": "string (RGBA color string like 'rgba(255, 65, 108, 0.4)')"
  }
]
Return ONLY the raw JSON array. Do not include markdown formatting.`;

    const result = await model.generateContent(prompt);
    console.log(result.response.text());
  } catch(e) {
    console.error(e.message);
  }
}
run();
