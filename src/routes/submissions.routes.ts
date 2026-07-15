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

export default router;