const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres' });
client.connect()
  .then(() => client.query(`SELECT s.id, s.content_url, s.description, s.created_at, a.title AS activity_title, a.id AS activity_id FROM submissions s JOIN users u ON u.id = s.user_id LEFT JOIN activities a ON a.id = s.activity_id WHERE u.username = $1 ORDER BY s.created_at DESC`, ['vedantmittal']))
  .then(res => console.log('success snaps', res.rows.length))
  .catch(err => console.error('ERROR:', err.message))
  .finally(() => client.end());
