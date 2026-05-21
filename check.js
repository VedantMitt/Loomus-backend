const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres', ssl: { rejectUnauthorized: false } });
client.connect()
  .then(() => client.query("ALTER TABLE activities ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITHOUT TIME ZONE"))
  .then(() => client.query("ALTER TABLE activities ADD COLUMN IF NOT EXISTS itinerary JSONB DEFAULT '[]'::jsonb"))
  .then(() => { console.log("Added end_date and itinerary columns"); client.end(); })
  .catch(e => { console.error(e); client.end(); });
