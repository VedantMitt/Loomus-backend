const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres'
});
client.connect()
  .then(() => client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'activities'"))
  .then(res => {
    console.log(res.rows);
    return client.end();
  })
  .catch(console.error);
