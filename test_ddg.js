async function run() {
  try {
    const res = await fetch('https://html.duckduckgo.com/html/?q=events+in+delhi+this+weekend+insider.in', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const text = await res.text();
    // match elements with class result__snippet
    const snippetMatches = text.match(/<a class="result__snippet[^>]*>(.*?)<\/a>/g);
    if (snippetMatches) {
      const snippets = snippetMatches.map(m => m.replace(/<[^>]+>/g, '')).join('\n');
      console.log(snippets);
    } else {
      console.log("No snippets found. DuckDuckGo might be blocking or changed format.");
    }
  } catch(e) {
    console.error(e.message);
  }
}
run();
