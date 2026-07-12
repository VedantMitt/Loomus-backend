const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres' });
client.connect()
  .then(() => client.query(`
    SELECT constraint_name, table_name, column_name 
    FROM information_schema.key_column_usage 
    WHERE constraint_name IN (
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE constraint_type = 'FOREIGN KEY'
    )
  `))
  .then(res => { 
    console.log(res.rows.filter(r => r.table_name === 'votes')); 
    client.end(); 
  })
  .catch(console.error);
