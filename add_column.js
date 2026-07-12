const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres'
});
client.connect()
  .then(() => client.query("ALTER TABLE activities ADD COLUMN chapter_cover text"))
  .then(() => {
    console.log('Added chapter_cover column');
    return client.end();
  })
  .catch(console.error);
