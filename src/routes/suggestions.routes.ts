import { Router } from "express";
import pool from "../db";
import { authMiddleware, AuthRequest } from "../middleware/auth.middleware";

const router = Router();

// Get personalized suggestions for a user
router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // 1. Fetch current user's preferences and info
    const userQuery = await pool.query(
      `SELECT interests, vibe_tags, location_lat, location_lng, location_name, dob, gender, college, year 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const currentUser = userQuery.rows[0];
    const interests = currentUser.interests || [];
    const vibes = currentUser.vibe_tags || [];
    
    // We combine interests and vibes to form a robust "preference profile"
    const combinedPrefs = [...new Set([...interests, ...vibes])];

    // 2. Suggest People (Users)
    // - Exclude self, existing friends, blocked users
    // - Rank by number of shared interests/vibes
    // - (Optional) Incorporate distance if lat/lng available, but for now we'll prioritize interests and same college
    
    const suggestedPeopleQuery = `
      SELECT 
        u.id, u.name, u.username, u.profile_pic, u.bio, u.college, u.year, u.interests, u.vibe_tags,
        (
          SELECT COUNT(*)
          FROM unnest(u.interests || u.vibe_tags) AS tag
          WHERE tag = ANY($2::text[])
        ) AS shared_tags_count
      FROM users u
      WHERE u.id != $1
        AND u.is_verified = TRUE
        AND u.id NOT IN (
          SELECT user_id2 FROM friends WHERE user_id1 = $1
          UNION
          SELECT user_id1 FROM friends WHERE user_id2 = $1
        )
        AND u.id NOT IN (
          SELECT blocked_id FROM blocks WHERE blocker_id = $1
          UNION
          SELECT blocker_id FROM blocks WHERE blocked_id = $1
        )
      ORDER BY 
        shared_tags_count DESC,
        CASE WHEN u.college = $3 THEN 1 ELSE 0 END DESC,
        u.created_at DESC
      LIMIT 10
    `;
    
    const people = await pool.query(suggestedPeopleQuery, [
      userId, 
      combinedPrefs, 
      currentUser.college
    ]);

    // 3. Suggest Activities
    // - Upcoming activities
    // - Rank by overlapping interests (if we had tags for activities) 
    //   Wait, activities have 'type', 'category', 'mood'. We can match these against user preferences.
    const suggestedActivitiesQuery = `
      SELECT 
        a.id, a.title, a.type, a.date, a.location, a.banner, a.mode, a.category, a.mood,
        u.name as host_name, u.profile_pic as host_avatar,
        (
          SELECT COUNT(*)
          FROM unnest(a.mood || ARRAY[a.category, a.type]) AS tag
          WHERE tag = ANY($2::text[])
        ) + 
        (CASE WHEN $3::text IS NOT NULL AND $3::text != '' AND a.location ILIKE '%' || $3::text || '%' THEN 5 ELSE 0 END)
        AS relevance_score
      FROM activities a
      LEFT JOIN users u ON a.host_id = u.id
      WHERE a.date > NOW()
        AND a.deleted_at IS NULL
        AND a.is_public = TRUE
        AND a.id NOT IN (
          SELECT activity_id FROM activity_members WHERE user_id = $1
        )
      ORDER BY 
        relevance_score DESC,
        a.created_at DESC
      LIMIT 10
    `;

    const activities = await pool.query(suggestedActivitiesQuery, [
      userId,
      combinedPrefs,
      currentUser.location_name || ''
    ]);

    res.json({
      people: people.rows,
      activities: activities.rows,
    });
    
  } catch (err) {
    console.error("SUGGESTIONS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch suggestions" });
  }
});

export default router;
