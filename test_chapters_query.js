const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres' });
client.connect()
  .then(() => client.query(`SELECT a.id, a.title, a.type, a.date, a.location, a.description, a.banner AS media_url, a.host_id, u.name AS host_name, u.username AS host_username, u.profile_pic AS host_pic, (SELECT COUNT(*) FROM activity_members WHERE activity_id = a.id AND status = 'accepted') AS members_count FROM activities a JOIN users u ON u.id = a.host_id WHERE u.username = $1 AND a.deleted_at IS NULL ORDER BY a.created_at DESC`, ['vedantmittal']))
  .then(res => console.log('success', res.rows.length))
  .catch(err => console.error('ERROR:', err.message))
  .finally(() => client.end());
