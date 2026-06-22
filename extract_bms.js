const fs = require('fs');
const text = fs.readFileSync('bms.html', 'utf-8');
const match = text.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
if (match) {
  fs.writeFileSync('bms.json', match[1]);
  console.log('Saved bms.json');
} else {
  console.log('No NEXT_DATA');
}
