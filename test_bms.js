async function run() {
  try {
    const res = await fetch('https://in.bookmyshow.com/explore/events-national-capital-region-ncr', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const text = await res.text();
    // They usually have <script type="application/ld+json">
    // let's grab all of them
    const matches = text.match(/<script type="application\/ld\+json">(.*?)<\/script>/g);
    if (matches) {
      for (const m of matches) {
        const inner = m.replace(/<script type="application\/ld\+json">/, '').replace(/<\/script>/, '');
        try {
          const data = JSON.parse(inner);
          if (data['@type'] === 'ItemList' && data.itemListElement) {
            console.log("FOUND EVENTS:", data.itemListElement.length);
            console.log(JSON.stringify(data.itemListElement.slice(0, 2), null, 2));
            return;
          }
        } catch(err) {}
      }
    }
    console.log('no ld+json with events found');
  } catch(e) {
    console.error(e.message);
  }
}
run();
