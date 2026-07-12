const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres' });
client.connect()
  .then(() => client.query(`SELECT id, name, username, bio, college, branch, year, interests, vibe_tags, CASE WHEN status_updated_at IS NOT NULL AND status_updated_at > NOW() - INTERVAL '24 hours' THEN current_status ELSE NULL END AS current_status, status_updated_at, friends_if, profile_pic, instagram, linkedin, is_private, (SELECT COUNT(*) FROM friends WHERE (user_id1 = users.id OR user_id2 = users.id) AND status = 'accepted') AS followers_count, (SELECT COUNT(*) FROM activities WHERE host_id = users.id) AS chapters_count, (SELECT COUNT(*) FROM rooms WHERE host_id = users.id) AS looms_count FROM users WHERE username = $1`, ['vedantmittal']))
  .then(res => console.log(res.rows))
  .catch(err => console.error('ERROR:', err.message))
  .finally(() => client.end());
