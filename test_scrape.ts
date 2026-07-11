import axios from "axios";
import * as cheerio from "cheerio";

async function run() {
  try {
    const res = await axios.get("https://allevents.in/new%20delhi/all", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });
    
    const $ = cheerio.load(res.data);
    const events: any[] = [];
    
    $('.event-card').each((i, el) => {
        if(i > 5) return;
        const title = $(el).attr('data-title');
        const location = $(el).find('.subtitle').text().trim();
        const time = $(el).find('.date').text().trim();
        const image = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');
        if(title) {
            events.push({ title, location, time, image });
        }
    });
    
    if (events.length === 0) {
        // alternative selectors
        $('li.event-item').each((i, el) => {
            if(i > 5) return;
            const title = $(el).attr('data-title') || $(el).find('.title h3').text().trim();
            const location = $(el).find('.meta-right').text().trim() || "Delhi";
            const time = $(el).find('.date').text().trim();
            const image = $(el).find('img').attr('src');
            if(title) {
                events.push({ title, location, time, image });
            }
        });
    }
    
    console.log(JSON.stringify(events, null, 2));
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
run();
