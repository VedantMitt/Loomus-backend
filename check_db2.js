const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres' });
client.connect()
  .then(() => client.query(`
      SELECT 
        id,
        name,
        username,
        (SELECT COUNT(*) FROM activities WHERE host_id = users.id) AS chapters_count,
        (SELECT COUNT(*) FROM rooms WHERE host_id = users.id) AS looms_count
      FROM users
      WHERE username = 'vedantmittal'
  `))
  .then(res => {
    console.log('Result:', res.rows[0]);
    client.end();
  })
  .catch(console.error);
