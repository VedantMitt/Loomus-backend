import { Router } from "express";
import pool from "../db";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

/**
 * POST /submissions/:id/vote
 */
router.post("/:id/vote", authMiddleware, async (req, res) => {
  const submissionId = req.params.id;
  const userId = (req as any).user?.id;

if (!userId) {
  return res.status(401).json({ error: "Unauthorized" });
}

  try {
    const submissionResult = await pool.query(
      "SELECT * FROM submissions WHERE id = $1",
      [submissionId]
    );

    if (submissionResult.rows.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const submission = submissionResult.rows[0];

    if (submission.user_id === userId) {
      return res.status(400).json({ error: "Cannot vote your own submission" });
    }

    const joinCheck = await pool.query(
      "SELECT * FROM activity_members WHERE activity_id = $1 AND user_id = $2",
      [submission.activity_id, userId]
    );

    if (joinCheck.rows.length === 0) {
      return res.status(403).json({ error: "Join activity before voting" });
    }

    const existingVote = await pool.query(
      "SELECT * FROM votes WHERE submission_id = $1 AND user_id = $2",
      [submissionId, userId]
    );

    let voted;

    if (existingVote.rows.length > 0) {
      await pool.query(
        "DELETE FROM votes WHERE submission_id = $1 AND user_id = $2",
        [submissionId, userId]
      );
      voted = false;
    } else {
      await pool.query(
        "INSERT INTO votes (submission_id, user_id) VALUES ($1, $2)",
        [submissionId, userId]
      );
      voted = true;
    }

    const voteCountResult = await pool.query(
      "SELECT COUNT(*) FROM votes WHERE submission_id = $1",
      [submissionId]
    );

    const voteCount = parseInt(voteCountResult.rows[0].count);

    res.json({
      message: voted ? "Voted successfully" : "Vote removed",
      voted,
      voteCount
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Voting failed" });
  }
});

/**
 * DELETE /submissions/:id
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  const submissionId = req.params.id;
  const userId = (req as any).user?.id;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const submissionResult = await pool.query(
      "SELECT * FROM submissions WHERE id = $1",
      [submissionId]
    );

    if (submissionResult.rows.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const submission = submissionResult.rows[0];
    const { activity_id, content_url } = submission;

    if (submission.user_id !== userId) {
      return res.status(403).json({ error: "Cannot delete someone else's submission" });
    }

    // Delete associated votes first to avoid foreign key constraints
    await pool.query("DELETE FROM votes WHERE submission_id = $1", [submissionId]);
    await pool.query("DELETE FROM submissions WHERE id = $1", [submissionId]);

    // Check if this was the cover or banner
    const activityResult = await pool.query(
      "SELECT chapter_cover, banner FROM activities WHERE id = $1",
      [activity_id]
    );

    if (activityResult.rows.length > 0) {
      const act = activityResult.rows[0];
      const wasChapterCover = act.chapter_cover === content_url;
      const wasBanner = act.banner === content_url;

      if (wasChapterCover || wasBanner) {
        // Find next oldest submission
        const nextSub = await pool.query(
          "SELECT content_url FROM submissions WHERE activity_id = $1 ORDER BY created_at ASC LIMIT 1",
          [activity_id]
        );
        const nextUrl = nextSub.rows.length > 0 ? nextSub.rows[0].content_url : null;
        
        if (wasChapterCover && wasBanner) {
          await pool.query("UPDATE activities SET chapter_cover = $1, banner = $1 WHERE id = $2", [nextUrl, activity_id]);
        } else if (wasChapterCover) {
          await pool.query("UPDATE activities SET chapter_cover = $1 WHERE id = $2", [nextUrl, activity_id]);
        } else if (wasBanner) {
          await pool.query("UPDATE activities SET banner = $1 WHERE id = $2", [nextUrl, activity_id]);
        }
      }
    }

    res.json({ message: "Submission deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete submission" });
  }
});

/**
 * PUT /submissions/:id
 */
router.put("/:id", authMiddleware, async (req, res) => {
  const submissionId = req.params.id;
  const userId = (req as any).user?.id;
  const { location } = req.body;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const submissionResult = await pool.query(
      "SELECT * FROM submissions WHERE id = $1",
      [submissionId]
    );

    if (submissionResult.rows.length === 0) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (submissionResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Cannot edit someone else's submission" });
    }

    const sub = submissionResult.rows[0];
    let meta = {};
    try {
      if (sub.description && sub.description.startsWith('{')) {
        meta = JSON.parse(sub.description);
      }
    } catch(e) {}

    meta = { ...meta, location };
    
    await pool.query(
      "UPDATE submissions SET description = $1 WHERE id = $2",
      [JSON.stringify(meta), submissionId]
    );

    res.json({ message: "Location updated successfully", description: JSON.stringify(meta) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update submission" });
  }
});

/**
 * GET /submissions/:id/comments
 */
router.get("/:id/comments", authMiddleware, async (req, res) => {
  const submissionId = req.params.id;
  try {
    const { rows } = await pool.query(
      `SELECT c.*, u.name as user_name, u.username as user_username, u.profile_pic as user_pic,
       (SELECT COUNT(*) FROM comment_likes cl WHERE cl.comment_id = c.id) as like_count,
       EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = $2) as has_liked
       FROM activity_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.submission_id = $1
       ORDER BY c.created_at DESC`,
      [submissionId, (req as any).user?.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET SUBMISSION COMMENTS ERROR:", err);
    res.status(500).json({ error: "Failed to load comments" });
  }
});

/**
 * POST /submissions/:id/comments
 */
router.post("/:id/comments", authMiddleware, async (req, res) => {
  const submissionId = req.params.id;
  const userId = (req as any).user?.id;
  const { content, parent_id } = req.body;

  if (!content?.trim()) {
    return res.status(400).json({ error: "Content is required" });
  }

  try {
    // Check if submission exists and get its activity_id
    const subRes = await pool.query("SELECT activity_id, user_id FROM submissions WHERE id = $1", [submissionId]);
    if (subRes.rows.length === 0) return res.status(404).json({ error: "Submission not found" });
    const activityId = subRes.rows[0].activity_id;
    const authorId = subRes.rows[0].user_id;

    // Check if user has joined the activity (so they can comment)
    const joinCheck = await pool.query("SELECT * FROM activity_members WHERE activity_id = $1 AND user_id = $2", [activityId, userId]);
    if (joinCheck.rows.length === 0) {
      // also check if they are the host
      const hostCheck = await pool.query("SELECT host_id FROM activities WHERE id = $1", [activityId]);
      if (hostCheck.rows.length === 0 || hostCheck.rows[0].host_id !== userId) {
        return res.status(403).json({ error: "Must join activity to comment" });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO activity_comments (activity_id, submission_id, user_id, content, parent_id) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [activityId, submissionId, userId, content.trim(), parent_id || null]
    );

    // Fetch user details for the response
    const userRes = await pool.query("SELECT name, username, profile_pic FROM users WHERE id = $1", [userId]);
    const comment = {
      ...rows[0],
      user_name: userRes.rows[0].name,
      user_username: userRes.rows[0].username,
      user_pic: userRes.rows[0].profile_pic,
      like_count: 0,
      has_liked: false
    };
    
    // Notify submission author if someone else comments
    if (authorId !== userId) {
      await pool.query(
        `INSERT INTO notifications (user_id, sender_id, type, metadata) 
         VALUES ($1, $2, 'activity_comment', $3)`,
        [authorId, userId, JSON.stringify({ activity_id: activityId, submission_id: submissionId, comment_id: comment.id })]
      );
    }

    res.json(comment);
  } catch (err) {
    console.error("POST SUBMISSION COMMENT ERROR:", err);
    res.status(500).json({ error: "Failed to post comment" });
  }
});

export default router;