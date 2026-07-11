const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres' });
client.connect()
  .then(() => client.query("SELECT id, username FROM users WHERE username = 'vedantmittal'"))
  .then(res => {
    console.log('User:', res.rows[0]);
    if (!res.rows[0]) return;
    return Promise.all([
      client.query('SELECT count(*) FROM activities WHERE host_id = $1', [res.rows[0].id]),
      client.query('SELECT count(*) FROM submissions WHERE user_id = $1', [res.rows[0].id])
    ]);
  })
  .then(res => {
    if (res) {
      console.log('Chapters:', res[0].rows[0].count, 'Snaps:', res[1].rows[0].count);
    }
    client.end();
  })
  .catch(console.error);
