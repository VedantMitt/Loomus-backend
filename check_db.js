const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:X8IAM9013%40cool@db.katxvhfxjisnruytqgto.supabase.co:5432/postgres' });
client.connect()
  .then(() => {
    return client.query(`
      SELECT 
        a.id, a.title, a.is_public
      FROM activities a
      JOIN users u ON u.id = a.host_id
      WHERE u.username = $1 
        AND a.deleted_at IS NULL 
        AND a.is_chapter_deleted = false 
        AND a.date < NOW()
        AND (
          a.is_public = true 
          OR a.host_id = $2
          OR EXISTS (
            SELECT 1 FROM activity_members am 
            WHERE am.activity_id = a.id AND am.user_id = $2 AND am.status = 'accepted'
          )
        )
      ORDER BY a.created_at DESC
    `, ['vedantmittal', null]);
  })
  .then(res => {
    console.log('Public chapters:', res.rows.length);
    client.end();
  })
  .catch(console.error);
