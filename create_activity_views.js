const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres'
});
client.connect()
  .then(() => client.query(`
    CREATE TABLE IF NOT EXISTS activity_views (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      activity_id UUID REFERENCES activities(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      viewed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
      UNIQUE(activity_id, user_id)
    )
  `))
  .then(() => {
    console.log("activity_views table created successfully");
    return client.end();
  })
  .catch(err => {
    console.error("Error:", err);
    client.end();
  });
