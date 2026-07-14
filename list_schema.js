const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres'
});
client.connect()
  .then(() => client.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position"))
  .then(res => {
    const schema = {};
    res.rows.forEach(r => {
      if(!schema[r.table_name]) schema[r.table_name] = [];
      schema[r.table_name].push(r.column_name);
    });
    console.log(JSON.stringify(schema, null, 2));
    return client.end();
  })
  .catch(console.error);
