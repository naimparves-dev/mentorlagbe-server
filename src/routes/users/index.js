import express from "express";
import { ObjectId } from "mongodb";
import { connectDB, getCollections } from "../../config/db.js";
import { verifyToken, verifyStudent } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = express.Router();

// GET /api/users/me
router.get(
  "/me",
  verifyToken,
  asyncHandler(async (req, res) => {
    return res.json({ success: true, user: req.user });
  })
);

// PATCH /api/users/profile
router.patch(
  "/profile",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { name, phone, bio, image } = req.body;
    const { db } = await connectDB();
    const { users, tuitions } = getCollections(db);

    const updateFields = { updatedAt: new Date() };
    if (typeof name === "string" && name.trim()) updateFields.name = name.trim();
    if (typeof phone === "string") updateFields.phone = phone.trim();
    if (typeof bio === "string") updateFields.bio = bio.trim();
    if (typeof image === "string") updateFields.image = image.trim();

    await users.updateOne({ email: req.user.email }, { $set: updateFields });

    if (updateFields.name && req.user.role === "tutor") {
      await tuitions.updateMany(
        { tutorEmail: req.user.email },
        { $set: { tutorName: updateFields.name } }
      );
    }

    const updated = await users.findOne({ email: req.user.email });
    return res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        _id: String(updated._id),
        name: updated.name,
        email: updated.email,
        image: updated.image || "",
        role: updated.role || "student",
        phone: updated.phone || "",
        bio: updated.bio || "",
        plan: updated.plan || "free",
        bookmarks: updated.bookmarks || [],
        createdAt: updated.createdAt,
      },
    });
  })
);

// GET /api/users/bookmarks
router.get(
  "/bookmarks",
  verifyToken,
  verifyStudent,
  asyncHandler(async (req, res) => {
    const { db } = await connectDB();
    const { tuitions } = getCollections(db);

    const bookmarkIds = (req.user.bookmarks || [])
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const savedTuitions = bookmarkIds.length
      ? await tuitions
          .find({ _id: { $in: bookmarkIds }, approvalStatus: "approved" })
          .sort({ createdAt: -1 })
          .toArray()
      : [];

    return res.json({
      success: true,
      bookmarks: savedTuitions,
      limit: req.user.plan === "pro" ? null : 5,
    });
  })
);

// POST /api/users/bookmarks/:tuitionId
router.post(
  "/bookmarks/:tuitionId",
  verifyToken,
  verifyStudent,
  asyncHandler(async (req, res) => {
    const { tuitionId } = req.params;
    if (!ObjectId.isValid(tuitionId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid tuition ID" });
    }

    const { db } = await connectDB();
    const { users } = getCollections(db);

    const currentBookmarks = req.user.bookmarks || [];
    const alreadyBookmarked = currentBookmarks.includes(tuitionId);

    if (alreadyBookmarked) {
      const updatedBookmarks = currentBookmarks.filter((id) => id !== tuitionId);
      await users.updateOne(
        { email: req.user.email },
        { $set: { bookmarks: updatedBookmarks } }
      );
      return res.json({
        success: true,
        bookmarked: false,
        bookmarks: updatedBookmarks,
        message: "Removed from saved tuitions",
      });
    }

    if (req.user.plan !== "pro" && currentBookmarks.length >= 5) {
      return res.status(403).json({
        success: false,
        code: "BOOKMARK_LIMIT_REACHED",
        message:
          "Free plan students can bookmark up to 5 tuitions. Upgrade to Pro Student ($10) for unlimited bookmarks.",
      });
    }

    const updatedBookmarks = [...currentBookmarks, tuitionId];
    await users.updateOne(
      { email: req.user.email },
      { $set: { bookmarks: updatedBookmarks } }
    );

    return res.json({
      success: true,
      bookmarked: true,
      bookmarks: updatedBookmarks,
      message: "Saved to your bookmarked tuitions",
    });
  })
);

export default router;
