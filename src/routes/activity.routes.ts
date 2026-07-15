import { Router } from "express";
import pool from "../db";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// ─────────────────────────────────────────────
// GET /activities/places/autocomplete — location suggestions
// ─────────────────────────────────────────────
router.get("/places/autocomplete", authMiddleware, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    if (process.env.GOOGLE_MAPS_API_KEY) {
      const resp = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q as string)}&key=${process.env.GOOGLE_MAPS_API_KEY}`);
      const data = await resp.json();
      if (data.predictions) {
        return res.json(data.predictions.map((p: any) => ({
          description: p.description,
          place_id: p.place_id
        })));
      }
    }
    // Fallback to OSM Nominatim
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q as string)}`, {
      headers: {
        "User-Agent": "LoomusApp/1.0"
      }
    });
    const data = await resp.json();
    if (!Array.isArray(data)) {
      return res.json([]);
    }
    return res.json(data.map((p: any) => ({
      description: p.display_name,
      place_id: p.place_id
    })));
  } catch (err) {
    console.error("PLACES AUTOCOMPLETE ERROR:", err);
    res.status(500).json({ error: "Failed to fetch places" });
  }
});

// ─────────────────────────────────────────────
// GET /activities — list with filters, search, tabs
// ─────────────────────────────────────────────
router.get("/", authMiddleware, async (req: any, res) => {
  const userId = req.user.id;
  const { type, status, search, tab, city, mode, is_free, college, mood, budget, area, category, is_public } = req.query;

  try {
    let conditions = ["a.deleted_at IS NULL"];
    let params: any[] = [userId];
    let paramIdx = 2;

    if (tab === 'my') {
      conditions.push("a.is_chapter_deleted = false");
      conditions.push(`NOT EXISTS (SELECT 1 FROM hidden_activities ha WHERE ha.activity_id = a.id AND ha.user_id = $1)`);
    } else {
      conditions.push("a.is_loom_deleted = false");
    }

    if (is_public === "true") {
      conditions.push(`a.is_public = TRUE`);
    }

    // Category filter
    if (type && type !== "all") {
      conditions.push(`LOWER(a.type) = LOWER($${paramIdx})`);
      params.push(type);
      paramIdx++;
    }

    // Time-based status filter
    if (status === "live") {
      conditions.push(`a.date <= NOW() AND (
        (a.end_date IS NOT NULL AND a.end_date >= NOW()) OR 
        (a.end_date IS NULL AND a.date >= NOW() - INTERVAL '24 hours')
      )`);
    } else if (status === "upcoming") {
      conditions.push(`a.date > NOW()`);
    } else if (status === "past" || status === "expired") {
      conditions.push(`(
        (a.end_date IS NOT NULL AND a.end_date < NOW()) OR 
        (a.end_date IS NULL AND a.date < NOW() - INTERVAL '24 hours')
      )`);
    }

    // City filter (match against location)
    if (city) {
      conditions.push(`LOWER(a.location) LIKE LOWER($${paramIdx})`);
      params.push(`%${city}%`);
      paramIdx++;
    }

    // College filter (match against official events)
    if (college) {
      conditions.push(`LOWER(a.college_name) = LOWER($${paramIdx})`);
      params.push(college);
      paramIdx++;
    }

    // Mode filter (online/offline)
    if (mode) {
      conditions.push(`LOWER(a.mode) = LOWER($${paramIdx})`);
      params.push(mode);
      paramIdx++;
    }

    // Paid/Free filter
    if (is_free === "true") {
      conditions.push(`(a.is_free = TRUE OR a.price = 0 OR a.price IS NULL)`);
    } else if (is_free === "false") {
      conditions.push(`a.is_free = FALSE AND a.price > 0`);
    }

    // Mood filter (array contains)
    if (mood) {
      conditions.push(`$${paramIdx} = ANY(a.mood)`);
      params.push(mood);
      paramIdx++;
    }

    // Budget range filter
    if (budget && budget !== "all") {
      conditions.push(`a.budget_range = $${paramIdx}`);
      params.push(budget);
      paramIdx++;
    }

    // Area filter
    if (area) {
      conditions.push(`LOWER(a.area) LIKE LOWER($${paramIdx})`);
      params.push(`%${area}%`);
      paramIdx++;
    }

    // Category filter (more specific than type)
    if (category && category !== "all") {
      conditions.push(`LOWER(a.category) = LOWER($${paramIdx})`);
      params.push(category);
      paramIdx++;
    }

    // Search
    if (search) {
      conditions.push(`(LOWER(a.title) LIKE LOWER($${paramIdx}) OR LOWER(a.description) LIKE LOWER($${paramIdx}))`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    // Tab: "my" = only activities user has joined/RSVP'd to, OR hosted
    let joinClause = "";
    if (tab === "my") {
      joinClause = `INNER JOIN (
        SELECT activity_id FROM activity_members WHERE user_id = $1
        UNION
        SELECT activity_id FROM activity_rsvps WHERE user_id = $1
        UNION
        SELECT id AS activity_id FROM activities WHERE host_id = $1
      ) my ON my.activity_id = a.id`;
    }

    const whereStr = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const { rows } = await pool.query(
      `
      SELECT
        a.*,
        u.name AS host_name,
        u.username AS host_username,
        u.profile_pic AS host_pic,
        COUNT(DISTINCT am.user_id) AS member_count,
        (SELECT COUNT(*) FROM activity_rsvps r WHERE r.activity_id = a.id AND r.status = 'going') AS going_count,
        (SELECT COUNT(*) FROM activity_rsvps r WHERE r.activity_id = a.id AND r.status = 'interested') AS interested_count,
        (SELECT status FROM activity_rsvps r WHERE r.activity_id = a.id AND r.user_id = $1) AS my_rsvp,
        EXISTS (
          SELECT 1 FROM activity_members am2
          WHERE am2.activity_id = a.id AND am2.user_id = $1
        ) AS joined,
        (SELECT COUNT(*) FROM submissions s WHERE s.activity_id = a.id) AS submission_count,
        (SELECT json_agg(json_build_object('name', pu.name, 'username', pu.username, 'profile_pic', pu.profile_pic))
         FROM (
           SELECT DISTINCT u2.name, u2.username, u2.profile_pic
           FROM activity_members am3
           JOIN users u2 ON u2.id = am3.user_id
           WHERE am3.activity_id = a.id
           LIMIT 5
         ) pu
        ) AS participant_previews
      FROM activities a
      JOIN users u ON u.id = a.host_id
      LEFT JOIN activity_members am ON am.activity_id = a.id
      ${joinClause}
      ${whereStr}
      GROUP BY a.id, u.name, u.username, u.profile_pic
      ORDER BY
        CASE WHEN a.date > NOW() THEN 0 ELSE 1 END,
        ABS(EXTRACT(EPOCH FROM (a.date - NOW()))) ASC
      `,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error("GET ACTIVITIES ERROR:", err);
    res.status(500).json({ error: "Failed to fetch activities" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/top — top trending activities (for discover page)
// ─────────────────────────────────────────────
router.get("/top", authMiddleware, async (req: any, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id, a.title, a.type, a.date, a.location, a.banner, a.mode, a.is_free, a.price,
        a.is_official, a.hosted_by_name, a.college_name, a.society_name,
        u.name AS host_name, u.username AS host_username, u.profile_pic AS host_pic,
        (SELECT COUNT(*) FROM activity_rsvps r WHERE r.activity_id = a.id AND r.status = 'going') AS going_count,
        (SELECT COUNT(*) FROM activity_rsvps r WHERE r.activity_id = a.id AND r.status = 'interested') AS interested_count
      FROM activities a
      JOIN users u ON u.id = a.host_id
      WHERE a.deleted_at IS NULL AND a.date > NOW() - INTERVAL '24 hours'
      ORDER BY going_count DESC, a.date ASC
      LIMIT 10
    `);
    res.json(rows);
  } catch (err) {
    console.error("TOP ACTIVITIES ERROR:", err);
    res.status(500).json({ error: "Failed to fetch top activities" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/feed/shared — feed of friends' shared scrapbooks
// ─────────────────────────────────────────────
router.get("/feed/shared", authMiddleware, async (req: any, res) => {
  const userId = req.user.id;
  try {
    const { rows } = await pool.query(`
      SELECT a.*, 
        u.name AS host_name, u.username AS host_username, u.profile_pic AS host_pic,
        (SELECT json_agg(json_build_object('url', s.content_url, 'desc', s.description, 'author_name', u2.name, 'author_pic', u2.profile_pic) ORDER BY s.created_at DESC)
         FROM submissions s JOIN users u2 ON u2.id = s.user_id WHERE s.activity_id = a.id) as timeline_photos,
        (SELECT json_agg(json_build_object('name', u3.name, 'username', u3.username, 'profile_pic', u3.profile_pic))
         FROM activity_members am3 JOIN users u3 ON u3.id = am3.user_id WHERE am3.activity_id = a.id) as participant_previews,
        (SELECT COUNT(*) FROM activity_members am2 WHERE am2.activity_id = a.id) as member_count,
        (SELECT COUNT(*) FROM activity_likes al WHERE al.activity_id = a.id) as likes_count,
        EXISTS(SELECT 1 FROM activity_likes al WHERE al.activity_id = a.id AND al.user_id = $1) as has_liked,
        (SELECT COUNT(*) FROM activity_comments ac WHERE ac.activity_id = a.id) as comment_count
      FROM activities a
      JOIN users u ON u.id = a.host_id
      WHERE a.is_shared = TRUE AND a.deleted_at IS NULL
        AND (
          a.is_public = TRUE
          OR a.host_id = $1
          OR EXISTS (SELECT 1 FROM activity_members am WHERE am.activity_id = a.id AND am.user_id = $1)
        )
        AND EXISTS (
          SELECT 1 FROM activity_members am 
          JOIN friends f ON (f.user_id1 = am.user_id OR f.user_id2 = am.user_id)
          WHERE am.activity_id = a.id AND am.user_id != $1
          AND (f.user_id1 = $1 OR f.user_id2 = $1)
          AND f.status = 'accepted'
        )
      ORDER BY a.shared_at DESC NULLS LAST
      LIMIT 20
    `, [userId]);
    res.json(rows);
  } catch (err) {
    console.error("SHARED FEED ERROR:", err);
    res.status(500).json({ error: "Failed to fetch shared scrapbooks" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/share — share scrapbook to feed
// ─────────────────────────────────────────────
router.post("/:id/share", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const { caption } = req.body || {};

  try {
    // Allow host or members to share
    const memberCheck = await pool.query(`
      SELECT 1 FROM activity_members WHERE activity_id = $1 AND user_id = $2
      UNION
      SELECT 1 FROM activities WHERE id = $1 AND host_id = $2
    `, [activityId, userId]);
    if (memberCheck.rowCount === 0) return res.status(403).json({ error: "Not authorized to share" });

    await pool.query(
      `UPDATE activities SET is_shared = TRUE, shared_at = NOW(), shared_caption = COALESCE($2, shared_caption) WHERE id = $1`,
      [activityId, caption || null]
    );
    res.json({ message: "Scrapbook shared to feed!" });
  } catch (err) {
    console.error("SHARE SCRAPBOOK ERROR:", err);
    res.status(500).json({ error: "Failed to share scrapbook" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/unshare — remove scrapbook from feed
// ─────────────────────────────────────────────
router.post("/:id/unshare", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;

  try {
    // Allow host or members to unshare
    const memberCheck = await pool.query(`
      SELECT 1 FROM activity_members WHERE activity_id = $1 AND user_id = $2
      UNION
      SELECT 1 FROM activities WHERE id = $1 AND host_id = $2
    `, [activityId, userId]);
    if (memberCheck.rowCount === 0) return res.status(403).json({ error: "Not authorized to unshare" });

    await pool.query(
      `UPDATE activities SET is_shared = FALSE, shared_caption = NULL WHERE id = $1`,
      [activityId]
    );
    res.json({ message: "Scrapbook removed from feed!" });
  } catch (err) {
    console.error("UNSHARE SCRAPBOOK ERROR:", err);
    res.status(500).json({ error: "Failed to unshare scrapbook" });
  }
});

// ─────────────────────────────────────────────
// POST /activities — create new activity
// ─────────────────────────────────────────────
router.post("/", authMiddleware, async (req: any, res) => {
  const userId = req.user.id;
  const { 
    title, type, date, location, description, banner, mode, 
    max_participants, join_deadline, submission_deadline, 
    allow_submissions, format, social_links, price, is_free,
    is_official, hosted_by_name, college_name, society_name,
    mood, budget_range, area, category, is_public
  } = req.body;

  if (!title || !type || !date || !location) {
    return res.status(400).json({ error: "title, type, date, location are required" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO activities (
        title, type, date, location, description, banner, mode, host_id, 
        max_participants, join_deadline, submission_deadline, allow_submissions, 
        format, social_links, price, is_free,
        is_official, hosted_by_name, college_name, society_name,
        mood, budget_range, area, category, is_public
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
       RETURNING *`,
      [
        title, type, date, location, description || null, banner || null, mode || null, userId, 
        max_participants || null, join_deadline || null, submission_deadline || null, 
        allow_submissions === undefined ? true : allow_submissions, format || 'Event', 
        JSON.stringify(social_links || []), price || 0, is_free !== undefined ? is_free : true,
        is_official === undefined ? false : is_official,
        hosted_by_name || null, college_name || null, society_name || null,
        mood || '{}', budget_range || 'free', area || null, category || null,
        is_public === undefined ? false : is_public
      ]
    );

    // Auto-join the host as a member
    await pool.query(
      `INSERT INTO activity_members (activity_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [rows[0].id, userId]
    );

    // Auto-RSVP as going
    await pool.query(
      `INSERT INTO activity_rsvps (activity_id, user_id, status) VALUES ($1, $2, 'going') ON CONFLICT (activity_id, user_id) DO UPDATE SET status = 'going'`,
      [rows[0].id, userId]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("CREATE ACTIVITY ERROR:", err);
    res.status(500).json({ error: "Failed to create activity" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/:id — single activity detail
// ─────────────────────────────────────────────
router.get("/:id", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;

  try {
    // Increment view count
    await pool.query(`UPDATE activities SET view_count = COALESCE(view_count, 0) + 1 WHERE id = $1`, [activityId]);

    const { rows } = await pool.query(
      `
      SELECT
        a.*,
        u.name AS host_name,
        u.username AS host_username,
        u.profile_pic AS host_pic,
        u.id AS host_user_id,
        COUNT(DISTINCT am.user_id) AS member_count,
        (SELECT COUNT(*) FROM activity_rsvps r WHERE r.activity_id = a.id AND r.status = 'going') AS going_count,
        (SELECT COUNT(*) FROM activity_rsvps r WHERE r.activity_id = a.id AND r.status = 'interested') AS interested_count,
        (SELECT status FROM activity_rsvps r WHERE r.activity_id = a.id AND r.user_id = $2) AS my_rsvp,
        EXISTS (
          SELECT 1 FROM activity_members am2
          WHERE am2.activity_id = a.id AND am2.user_id = $2
        ) AS has_joined,
        (SELECT COUNT(*) FROM submissions s WHERE s.activity_id = a.id) AS submission_count,
        (SELECT COUNT(*) FROM activity_comments c WHERE c.activity_id = a.id) AS comment_count
      FROM activities a
      JOIN users u ON u.id = a.host_id
      LEFT JOIN activity_members am ON am.activity_id = a.id
      WHERE a.id = $1
      GROUP BY a.id, u.name, u.username, u.profile_pic, u.id
      `,
      [activityId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Activity not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("GET ACTIVITY ERROR:", err);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/rsvp — set RSVP status
// ─────────────────────────────────────────────
router.post("/:id/rsvp", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const { status } = req.body; // 'going' | 'interested' | 'not_going'

  if (!["going", "interested", "not_going"].includes(status)) {
    return res.status(400).json({ error: "Status must be going, interested, or not_going" });
  }

  try {
    if (status === "not_going") {
      // Remove RSVP
      await pool.query(`DELETE FROM activity_rsvps WHERE activity_id = $1 AND user_id = $2`, [activityId, userId]);
      // Also remove from activity_members
      await pool.query(`DELETE FROM activity_members WHERE activity_id = $1 AND user_id = $2`, [activityId, userId]);
    } else {
      // Upsert RSVP
      await pool.query(
        `INSERT INTO activity_rsvps (activity_id, user_id, status) VALUES ($1, $2, $3)
         ON CONFLICT (activity_id, user_id) DO UPDATE SET status = $3`,
        [activityId, userId, status]
      );

      // Also add to activity_members for backward compatibility
      if (status === "going") {
        await pool.query(
          `INSERT INTO activity_members (activity_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [activityId, userId]
        );

        // Also handle room creation/join
        const room = await pool.query(
          `INSERT INTO rooms (activity_id, name, type, host_id, visibility, searchable)
           SELECT id, title, 'WATCH PARTY', host_id, 'public', TRUE FROM activities WHERE id = $1
           ON CONFLICT (activity_id) DO UPDATE SET activity_id = EXCLUDED.activity_id
           RETURNING id`,
          [activityId]
        );
        await pool.query(
          `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [room.rows[0].id, userId]
        );
      }
    }

    // Return updated counts
    const counts = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM activity_rsvps WHERE activity_id = $1 AND status = 'going') AS going_count,
        (SELECT COUNT(*) FROM activity_rsvps WHERE activity_id = $1 AND status = 'interested') AS interested_count,
        (SELECT status FROM activity_rsvps WHERE activity_id = $1 AND user_id = $2) AS my_rsvp
      `,
      [activityId, userId]
    );

    res.json(counts.rows[0]);
  } catch (err) {
    console.error("RSVP ERROR:", err);
    res.status(500).json({ error: "RSVP failed" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/join — legacy join (backward compat)
// ─────────────────────────────────────────────
router.post("/:id/join", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user?.id;

  try {
    await pool.query(
      `INSERT INTO activity_members (activity_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [activityId, userId]
    );

    // Also set RSVP as going
    await pool.query(
      `INSERT INTO activity_rsvps (activity_id, user_id, status) VALUES ($1, $2, 'going')
       ON CONFLICT (activity_id, user_id) DO UPDATE SET status = 'going'`,
      [activityId, userId]
    );

    const room = await pool.query(
      `INSERT INTO rooms (activity_id, name, type, host_id, visibility, searchable)
       SELECT id, title, 'WATCH PARTY', host_id, 'public', TRUE FROM activities WHERE id = $1
       ON CONFLICT (activity_id) DO UPDATE SET activity_id = EXCLUDED.activity_id
       RETURNING id`,
      [activityId]
    );

    await pool.query(
      `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [room.rows[0].id, userId]
    );

    res.json({ roomId: room.rows[0].id });
  } catch (err: any) {
    console.error("JOIN ACTIVITY ERROR:", err.message);
    res.status(500).json({ error: "Join failed" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/:id/comments — get comments
// ─────────────────────────────────────────────
router.get("/:id/comments", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const currentUserId = req.user?.id;

  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.name, u.username, u.profile_pic,
        (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) as likes_count,
        EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = $2) as has_liked
       FROM activity_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.activity_id = $1
       ORDER BY c.created_at ASC`,
      [activityId, currentUserId]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET COMMENTS ERROR:", err);
    res.status(500).json({ error: "Failed to load comments" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/comments — add comment
// ─────────────────────────────────────────────
router.post("/:id/comments", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const { content, parent_id } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "Comment content is required" });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO activity_comments (activity_id, user_id, content, parent_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [activityId, userId, content.trim(), parent_id || null]
    );

    // Fetch user info to return with comment
    const user = await pool.query(`SELECT name, username, profile_pic FROM users WHERE id = $1`, [userId]);

    res.json({ ...rows[0], ...user.rows[0] });
  } catch (err) {
    console.error("POST COMMENT ERROR:", err);
    res.status(500).json({ error: "Failed to post comment" });
  }
});

// ─────────────────────────────────────────────
// POST /comments/:id/like — like comment
// ─────────────────────────────────────────────
router.post("/comments/:id/like", authMiddleware, async (req: any, res) => {
  const commentId = req.params.id;
  const userId = req.user.id;

  try {
    await pool.query(
      `INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [commentId, userId]
    );
    res.json({ message: "Comment liked" });
  } catch (err) {
    console.error("LIKE COMMENT ERROR:", err);
    res.status(500).json({ error: "Failed to like comment" });
  }
});

// ─────────────────────────────────────────────
// DELETE /comments/:id/like — unlike comment
// ─────────────────────────────────────────────
router.delete("/comments/:id/like", authMiddleware, async (req: any, res) => {
  const commentId = req.params.id;
  const userId = req.user.id;

  try {
    await pool.query(
      `DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2`,
      [commentId, userId]
    );
    res.json({ message: "Comment unliked" });
  } catch (err) {
    console.error("UNLIKE COMMENT ERROR:", err);
    res.status(500).json({ error: "Failed to unlike comment" });
  }
});

// ─────────────────────────────────────────────
// DELETE /comments/:id — delete comment
// ─────────────────────────────────────────────
router.delete("/comments/:id", authMiddleware, async (req: any, res) => {
  const commentId = req.params.id;
  const userId = req.user.id;

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM activity_comments WHERE id = $1 AND user_id = $2`,
      [commentId, userId]
    );

    if (rowCount === 0) {
      return res.status(403).json({ error: "Not authorized to delete this comment or comment not found" });
    }

    res.json({ message: "Comment deleted successfully" });
  } catch (err) {
    console.error("DELETE COMMENT ERROR:", err);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/like — toggle like
// ─────────────────────────────────────────────
router.post("/:id/like", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;

  try {
    const existing = await pool.query(
      `SELECT id FROM activity_likes WHERE activity_id = $1 AND user_id = $2`,
      [activityId, userId]
    );

    if (existing.rowCount > 0) {
      await pool.query(`DELETE FROM activity_likes WHERE id = $1`, [existing.rows[0].id]);
      return res.json({ liked: false });
    } else {
      await pool.query(
        `INSERT INTO activity_likes (activity_id, user_id) VALUES ($1, $2)`,
        [activityId, userId]
      );
      return res.json({ liked: true });
    }
  } catch (err) {
    console.error("POST LIKE ERROR:", err);
    res.status(500).json({ error: "Failed to toggle like" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/invite — invite a friend
// ─────────────────────────────────────────────
router.post("/:id/invite", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const inviterId = req.user.id;
  const { invitee_id } = req.body;

  if (!invitee_id) {
    return res.status(400).json({ error: "invitee_id is required" });
  }

  try {
    // Check they're friends
    const friendCheck = await pool.query(
      `SELECT 1 FROM friends WHERE status = 'accepted' AND
       ((user_id1 = $1 AND user_id2 = $2) OR (user_id1 = $2 AND user_id2 = $1))`,
      [inviterId, invitee_id]
    );

    if (friendCheck.rowCount === 0) {
      return res.status(403).json({ error: "You can only invite friends" });
    }

    await pool.query(
      `INSERT INTO activity_invites (activity_id, inviter_id, invitee_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [activityId, inviterId, invitee_id]
    );

    // Create notification
    const inviter = await pool.query(`SELECT name FROM users WHERE id = $1`, [inviterId]);
    const activity = await pool.query(`SELECT title FROM activities WHERE id = $1`, [activityId]);
    
    await pool.query(
      `INSERT INTO notifications (user_id, sender_id, type, metadata) VALUES ($1, $2, 'activity_invite', $3)`,
      [invitee_id, inviterId, JSON.stringify({ activity_id: activityId })]
    );

    res.json({ message: "Invite sent" });
  } catch (err) {
    console.error("INVITE ERROR:", err);
    res.status(500).json({ error: "Invite failed" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/:id/leaderboard — ranked submissions
// ─────────────────────────────────────────────
router.get("/:id/leaderboard", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;

  try {
    const { rows } = await pool.query(
      `
      SELECT
        s.id, s.content_url, s.description, s.created_at,
        u.id AS user_id, u.name, u.username, u.profile_pic,
        COUNT(v.id) AS vote_count,
        EXISTS (SELECT 1 FROM votes WHERE submission_id = s.id AND user_id = $2) AS has_voted
      FROM submissions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN votes v ON v.submission_id = s.id
      WHERE s.activity_id = $1
      GROUP BY s.id, u.id, u.name, u.username, u.profile_pic
      ORDER BY vote_count DESC, s.created_at ASC
      `,
      [activityId, userId]
    );

    // Add rank
    const ranked = rows.map((r: any, i: number) => ({ ...r, rank: i + 1 }));
    res.json(ranked);
  } catch (err) {
    console.error("LEADERBOARD ERROR:", err);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/submit — submit entry
// ─────────────────────────────────────────────
router.post("/:id/submit", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const { content_url, description } = req.body;

  if (!content_url) {
    return res.status(400).json({ error: "content_url required" });
  }

  try {
    const joined = await pool.query(
      `SELECT 1 FROM activity_members WHERE activity_id = $1 AND user_id = $2`,
      [activityId, userId]
    );
    if (joined.rowCount === 0) {
      return res.status(403).json({ error: "Join activity first" });
    }

    const { rows } = await pool.query(
      `WITH inserted AS (
         INSERT INTO submissions (activity_id, user_id, content_url, description)
         VALUES ($1, $2, $3, $4)
         RETURNING *
       ),
       updated_activity AS (
         UPDATE activities SET is_shared = TRUE, shared_at = NOW(), banner = COALESCE(NULLIF(banner, ''), $3), chapter_cover = COALESCE(NULLIF(chapter_cover, ''), $3) WHERE id = $1
       )
       SELECT u.*, u2.name, u2.username, u2.profile_pic 
       FROM inserted u
       JOIN users u2 ON u2.id = u.user_id`,
      [activityId, userId, content_url, description]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("SUBMIT ERROR:", err);
    res.status(500).json({ error: "Submission failed" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/cover — set cover image
// ─────────────────────────────────────────────
router.post("/:id/cover", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const { cover_url } = req.body;

  if (!cover_url) {
    return res.status(400).json({ error: "cover_url required" });
  }

  try {
    const activityCheck = await pool.query(
      `SELECT host_id FROM activities WHERE id = $1`,
      [activityId]
    );
    if (activityCheck.rowCount === 0) {
      return res.status(404).json({ error: "Activity not found" });
    }
    if (activityCheck.rows[0].host_id !== userId) {
      return res.status(403).json({ error: "Only host can set cover image" });
    }

    await pool.query(
      `UPDATE activities SET chapter_cover = $1 WHERE id = $2`,
      [cover_url, activityId]
    );

    res.json({ success: true, message: "Cover image updated" });
  } catch (err) {
    console.error("SET COVER ERROR:", err);
    res.status(500).json({ error: "Failed to set cover image" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/submissions
// ─────────────────────────────────────────────
router.post("/:id/submissions", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const { content_url, description } = req.body;

  if (!content_url) {
    return res.status(400).json({ error: "content_url is required" });
  }

  try {
    const { rows } = await pool.query(
      `WITH inserted AS (
         INSERT INTO submissions (activity_id, user_id, content_url, description)
         VALUES ($1, $2, $3, $4)
         RETURNING *
       ),
       updated_activity AS (
         UPDATE activities SET banner = COALESCE(NULLIF(banner, ''), $3), chapter_cover = COALESCE(NULLIF(chapter_cover, ''), $3) WHERE id = $1
       )
       SELECT u.*, u2.name, u2.username, u2.profile_pic 
       FROM inserted u
       JOIN users u2 ON u2.id = u.user_id`,
      [activityId, userId, content_url, description]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("POST SUBMISSION ERROR:", err);
    res.status(500).json({ error: "Failed to add submission" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/:id/submissions
// ─────────────────────────────────────────────
router.get("/:id/submissions", async (req, res) => {
  const activityId = req.params.id;

  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.content_url, s.description, s.created_at,
              u.id AS user_id, u.name, u.profile_pic
       FROM submissions s
       JOIN users u ON u.id = s.user_id
       WHERE s.activity_id = $1
       ORDER BY s.created_at DESC`,
      [activityId]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET SUBMISSIONS ERROR:", err);
    res.status(500).json({ error: "Failed to load submissions" });
  }
});

// ─────────────────────────────────────────────
// PUT /activities/:id — edit activity (host only)
// ─────────────────────────────────────────────
router.put("/:id", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const { 
    title, type, date, location, description, banner, chapter_cover, mode, 
    max_participants, join_deadline, submission_deadline, 
    allow_submissions, format, social_links,
    is_official, hosted_by_name, college_name, society_name,
    is_free, price, end_date, itinerary, is_public
  } = req.body;

  try {
    // Verify host
    const activity = await pool.query(`SELECT host_id FROM activities WHERE id = $1`, [activityId]);
    if (activity.rows.length === 0) return res.status(404).json({ error: "Activity not found" });
    if (activity.rows[0].host_id !== userId) return res.status(403).json({ error: "Only the host can edit" });

    const { rows } = await pool.query(
      `UPDATE activities SET
        title = COALESCE($1, title),
        type = COALESCE($2, type),
        date = COALESCE($3, date),
        location = COALESCE($4, location),
        description = COALESCE($5, description),
        banner = COALESCE($6, banner),
        chapter_cover = COALESCE($7, chapter_cover),
        mode = COALESCE($8, mode),
        max_participants = $9,
        join_deadline = $10,
        submission_deadline = $11,
        allow_submissions = COALESCE($12, allow_submissions),
        format = COALESCE($13, format),
        social_links = COALESCE($14, social_links),
        is_official = COALESCE($15, is_official),
        hosted_by_name = COALESCE($16, hosted_by_name),
        college_name = COALESCE($17, college_name),
        society_name = COALESCE($18, society_name),
        is_free = COALESCE($19, is_free),
        price = COALESCE($20, price),
        end_date = $21,
        itinerary = COALESCE($22, itinerary),
        is_public = COALESCE($23, is_public)
       WHERE id = $24
       RETURNING *`,
      [
        title, type, date, location, description, banner, chapter_cover, mode, 
        max_participants || null, join_deadline || null, submission_deadline || null, 
        allow_submissions, format, social_links ? JSON.stringify(social_links) : null,
        is_official, hosted_by_name, college_name, society_name,
        is_free, price,
        end_date || null,
        itinerary ? JSON.stringify(itinerary) : null,
        is_public,
        activityId
      ]
    );

    // Notify members
    const userQuery = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId]);
    const userName = userQuery.rows[0]?.name || 'Host';
    const members = await pool.query(`SELECT user_id FROM activity_members WHERE activity_id = $1 AND user_id != $2`, [activityId, userId]);
    
    for (let m of members.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, sender_id, type, metadata) VALUES ($1, $2, 'activity_edit', $3)`,
        [m.user_id, userId, JSON.stringify({ activity_id: activityId, message: `${userName} edited the plan: ${title || rows[0].title}` })]
      );
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("EDIT ACTIVITY ERROR:", err);
    res.status(500).json({ error: "Edit failed" });
  }
});

// ─────────────────────────────────────────────
// DELETE /activities/:id — delete activity (host only)
// ─────────────────────────────────────────────
router.delete("/:id", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const type = req.query.type; // 'loom' or 'chapter'

  try {
    if (type === 'chapter') {
      // User only wants to delete the Chapter (memories) for themselves
      await pool.query(`INSERT INTO hidden_activities (user_id, activity_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, activityId]);
      return res.json({ message: "Chapter hidden successfully" });
    }

    const activity = await pool.query(`SELECT host_id FROM activities WHERE id = $1`, [activityId]);
    if (activity.rows.length === 0) return res.status(404).json({ error: "Activity not found" });
    if (activity.rows[0].host_id !== userId) return res.status(403).json({ error: "Only the host can delete" });

    if (type === 'loom') {
      // User only wants to delete the Loom (future plans)
      await pool.query(`UPDATE activities SET is_loom_deleted = true WHERE id = $1`, [activityId]);
    } else {
      // Fallback: soft delete entire activity for backward compatibility
      await pool.query(`UPDATE activities SET deleted_at = NOW() WHERE id = $1`, [activityId]);
    }

    res.json({ message: "Activity deleted" });
  } catch (err) {
    console.error("DELETE ACTIVITY ERROR:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/:id/analytics — host analytics
// ─────────────────────────────────────────────
router.get("/:id/analytics", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;

  try {
    const activity = await pool.query(`SELECT host_id, view_count FROM activities WHERE id = $1`, [activityId]);
    if (activity.rows.length === 0) return res.status(404).json({ error: "Activity not found" });
    if (activity.rows[0].host_id !== userId) return res.status(403).json({ error: "Only the host can view analytics" });

    const stats = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM activity_members WHERE activity_id = $1) AS total_members,
        (SELECT COUNT(*) FROM activity_rsvps WHERE activity_id = $1 AND status = 'going') AS going_count,
        (SELECT COUNT(*) FROM activity_rsvps WHERE activity_id = $1 AND status = 'interested') AS interested_count,
        (SELECT COUNT(*) FROM submissions WHERE activity_id = $1) AS submission_count,
        (SELECT COUNT(*) FROM activity_comments WHERE activity_id = $1) AS comment_count,
        (SELECT COUNT(*) FROM activity_invites WHERE activity_id = $1) AS invite_count
      `,
      [activityId]
    );

    res.json({
      ...stats.rows[0],
      view_count: activity.rows[0].view_count || 0
    });
  } catch (err) {
    console.error("ANALYTICS ERROR:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/:id/participants — get participant list with avatars
// ─────────────────────────────────────────────
router.get("/:id/participants", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.username, u.profile_pic,
              COALESCE(r.status, 'going') AS rsvp_status
       FROM activity_members am
       JOIN users u ON u.id = am.user_id
       LEFT JOIN activity_rsvps r ON r.activity_id = am.activity_id AND r.user_id = am.user_id
       WHERE am.activity_id = $1
       ORDER BY am.joined_at ASC`,
      [activityId]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET PARTICIPANTS ERROR:", err);
    res.status(500).json({ error: "Failed to load participants" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/polls — create poll
// ─────────────────────────────────────────────
router.post("/:id/polls", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const { question, options } = req.body; // options is array of strings

  if (!question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: "question and at least 2 options required" });
  }

  try {
    const hostCheck = await pool.query(`SELECT host_id FROM activities WHERE id = $1`, [activityId]);
    if (hostCheck.rows.length === 0) return res.status(404).json({ error: "Activity not found" });
    if (hostCheck.rows[0].host_id !== userId) return res.status(403).json({ error: "Only host can create polls" });

    // Insert Poll
    const poll = await pool.query(
      `INSERT INTO activity_polls (activity_id, creator_id, question) VALUES ($1, $2, $3) RETURNING *`,
      [activityId, userId, question]
    );
    const pollId = poll.rows[0].id;

    // Insert Options
    for (const opt of options) {
      await pool.query(
        `INSERT INTO activity_poll_options (poll_id, option_text) VALUES ($1, $2)`,
        [pollId, opt]
      );
    }

    res.json(poll.rows[0]);
  } catch (err) {
    console.error("CREATE POLL ERROR:", err);
    res.status(500).json({ error: "Failed to create poll" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/:id/polls — get polls
// ─────────────────────────────────────────────
router.get("/:id/polls", async (req: any, res) => {
  const activityId = req.params.id;
  
  // Try to get token to see if user has voted
  let userId = null;
  if (req.headers.authorization) {
    const token = req.headers.authorization.split(" ")[1];
    if (token) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        userId = payload.userId || payload.id;
      } catch (e) {}
    }
  }

  try {
    const polls = await pool.query(
      `SELECT p.id, p.question, p.created_at, u.name as creator_name
       FROM activity_polls p
       LEFT JOIN users u ON u.id = p.creator_id
       WHERE p.activity_id = $1
       ORDER BY p.created_at DESC`,
      [activityId]
    );

    const result = [];
    for (const p of polls.rows) {
      const opts = await pool.query(
        `SELECT o.id, o.option_text, COUNT(v.id) as vote_count,
         EXISTS (SELECT 1 FROM activity_poll_votes WHERE option_id = o.id AND user_id = $2) as has_voted
         FROM activity_poll_options o
         LEFT JOIN activity_poll_votes v ON v.option_id = o.id
         WHERE o.poll_id = $1
         GROUP BY o.id, o.option_text`,
        [p.id, userId]
      );
      // Ensure vote_count is number
      const mappedOpts = opts.rows.map(o => ({
        ...o,
        vote_count: parseInt(o.vote_count || '0')
      }));
      result.push({ ...p, options: mappedOpts });
    }

    res.json(result);
  } catch (err) {
    console.error("GET POLLS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch polls" });
  }
});

// ─────────────────────────────────────────────
// POST /polls/:option_id/vote — vote on poll
// ─────────────────────────────────────────────
router.post("/polls/:option_id/vote", authMiddleware, async (req: any, res) => {
  const optionId = req.params.option_id;
  const userId = req.user.id;

  try {
    // Find poll ID
    const optRes = await pool.query(`SELECT poll_id FROM activity_poll_options WHERE id = $1`, [optionId]);
    if (optRes.rows.length === 0) return res.status(404).json({ error: "Option not found" });
    const pollId = optRes.rows[0].poll_id;

    // Check if user already voted in this poll
    const voted = await pool.query(`SELECT 1 FROM activity_poll_votes WHERE poll_id = $1 AND user_id = $2`, [pollId, userId]);
    
    if (voted.rows.length > 0) {
      // Switch vote
      await pool.query(
        `UPDATE activity_poll_votes SET option_id = $1 WHERE poll_id = $2 AND user_id = $3`,
        [optionId, pollId, userId]
      );
    } else {
      // New vote
      await pool.query(
        `INSERT INTO activity_poll_votes (poll_id, option_id, user_id) VALUES ($1, $2, $3)`,
        [pollId, optionId, userId]
      );
    }

    res.json({ message: "Voted successfully" });
  } catch (err) {
    console.error("VOTE ERROR:", err);
    res.status(500).json({ error: "Failed to cast vote" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/:id/announcements — get announcements
// ─────────────────────────────────────────────
router.get("/:id/announcements", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;

  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.name as sender_name, u.username as sender_username, u.profile_pic as sender_pic
       FROM activity_announcements a
       JOIN users u ON u.id = a.sender_id
       WHERE a.activity_id = $1
       ORDER BY a.created_at DESC`,
      [activityId]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET ANNOUNCEMENTS ERROR:", err);
    res.status(500).json({ error: "Failed to load announcements" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/announcements — post announcement (Host/Mod only)
// ─────────────────────────────────────────────
router.post("/:id/announcements", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const userId = req.user.id;
  const { content } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "Content is required" });
  }

  try {
    // Permission check: Host or Moderator
    const activity = await pool.query(`SELECT host_id, title FROM activities WHERE id = $1`, [activityId]);
    if (activity.rows.length === 0) return res.status(404).json({ error: "Activity not found" });

    const modCheck = await pool.query(
      `SELECT 1 FROM activity_moderators WHERE activity_id = $1 AND user_id = $2`,
      [activityId, userId]
    );

    if (activity.rows[0].host_id !== userId && modCheck.rows.length === 0) {
      return res.status(403).json({ error: "Only Host or Moderator can post announcements" });
    }

    // Insert announcement
    const { rows } = await pool.query(
      `INSERT INTO activity_announcements (activity_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *`,
      [activityId, userId, content.trim()]
    );

    // Notify all members (joined or RSVP'd)
    const members = await pool.query(
      `SELECT DISTINCT user_id FROM (
        SELECT user_id FROM activity_members WHERE activity_id = $1
        UNION
        SELECT user_id FROM activity_rsvps WHERE activity_id = $1
      ) all_m WHERE user_id != $2`,
      [activityId, userId]
    );

    const notificationPromises = members.rows.map(m => {
      return pool.query(
        `INSERT INTO notifications (user_id, sender_id, type, metadata) 
         VALUES ($1, $2, 'activity_announcement', $3)`,
        [m.user_id, userId, JSON.stringify({ activity_id: activityId, title: activity.rows[0].title })]
      );
    });

    await Promise.all(notificationPromises);

    res.json(rows[0]);
  } catch (err) {
    console.error("POST ANNOUNCEMENT ERROR:", err);
    res.status(500).json({ error: "Failed to post announcement" });
  }
});

// ─────────────────────────────────────────────
// GET /activities/:id/moderators — list moderators
// ─────────────────────────────────────────────
router.get("/:id/moderators", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.username, u.profile_pic, am.assigned_at
       FROM activity_moderators am
       JOIN users u ON u.id = am.user_id
       WHERE am.activity_id = $1
       ORDER BY am.assigned_at ASC`,
      [activityId]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET MODERATORS ERROR:", err);
    res.status(500).json({ error: "Failed to load moderators" });
  }
});

// ─────────────────────────────────────────────
// POST /activities/:id/moderators — add moderator (Host only)
// ─────────────────────────────────────────────
router.post("/:id/moderators", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const hostUserId = req.user.id;
  const { user_id } = req.body;

  if (!user_id) return res.status(400).json({ error: "user_id is required" });

  try {
    // Verify host
    const activity = await pool.query(`SELECT host_id FROM activities WHERE id = $1`, [activityId]);
    if (activity.rows.length === 0) return res.status(404).json({ error: "Activity not found" });
    if (activity.rows[0].host_id !== hostUserId) return res.status(403).json({ error: "Only the host can manage moderators" });

    await pool.query(
      `INSERT INTO activity_moderators (activity_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [activityId, user_id]
    );

    res.json({ message: "Moderator added" });
  } catch (err) {
    console.error("ADD MODERATOR ERROR:", err);
    res.status(500).json({ error: "Failed to add moderator" });
  }
});

// ─────────────────────────────────────────────
// DELETE /activities/:id/moderators/:userId — remove moderator (Host only)
// ─────────────────────────────────────────────
router.delete("/:id/moderators/:userId", authMiddleware, async (req: any, res) => {
  const activityId = req.params.id;
  const hostUserId = req.user.id;
  const targetUserId = req.params.userId;

  try {
    // Verify host
    const activity = await pool.query(`SELECT host_id FROM activities WHERE id = $1`, [activityId]);
    if (activity.rows.length === 0) return res.status(404).json({ error: "Activity not found" });
    if (activity.rows[0].host_id !== hostUserId) return res.status(403).json({ error: "Only the host can manage moderators" });

    await pool.query(
      `DELETE FROM activity_moderators WHERE activity_id = $1 AND user_id = $2`,
      [activityId, targetUserId]
    );

    res.json({ message: "Moderator removed" });
  } catch (err) {
    console.error("DELETE MODERATOR ERROR:", err);
    res.status(500).json({ error: "Failed to remove moderator" });
  }
});

export default router;
