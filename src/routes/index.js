import express from "express";
import { connectDB, getCollections } from "../config/db.js";
import { env } from "../config/env.js";
import { signAuthToken } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

import usersRoutes from "./users/index.js";
import tuitionsRoutes from "./tuitions/index.js";
import applicationsRoutes from "./applications/index.js";
import adminRoutes from "./admin/index.js";
import paymentsRoutes from "./payments/index.js";

const router = express.Router();

// Health check
router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    await connectDB();
    res.json({ success: true, database: "connected" });
  })
);

// Public platform stats
router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const { db } = await connectDB();
    const { users, tuitions, applications } = getCollections(db);

    const [totalTutors, totalStudents, approvedTuitions, totalApplications] =
      await Promise.all([
        users.countDocuments({ role: "tutor" }),
        users.countDocuments({ role: "student" }),
        tuitions.countDocuments({ approvalStatus: "approved", isActive: true }),
        applications.countDocuments(),
      ]);

    res.json({
      success: true,
      stats: {
        totalTutors,
        totalStudents,
        approvedTuitions,
        totalApplications,
      },
    });
  })
);

// Issue JWT for BetterAuth-authenticated user (shared MongoDB users collection)
router.post(
  "/jwt",
  asyncHandler(async (req, res) => {
    const { email } = req.body || {};
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required to issue JWT" });
    }

    const { db } = await connectDB();
    const { users } = getCollections(db);

    const user = await users.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const defaults = {};
    if (!user.role) defaults.role = "student";
    if (!user.plan) defaults.plan = "free";
    if (!Array.isArray(user.bookmarks)) defaults.bookmarks = [];
    if (Object.keys(defaults).length > 0) {
      await users.updateOne({ _id: user._id }, { $set: defaults });
      Object.assign(user, defaults);
    }

    const token = signAuthToken(user);

    res.cookie("ml_token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      token,
      user: {
        _id: String(user._id),
        name: user.name,
        email: user.email,
        image: user.image || "",
        role: user.role || "student",
        phone: user.phone || "",
        bio: user.bio || "",
        plan: user.plan || "free",
        bookmarks: user.bookmarks || [],
        createdAt: user.createdAt,
      },
    });
  })
);

router.post("/jwt/logout", (_req, res) => {
  res.clearCookie("ml_token", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  });
  return res.json({ success: true, message: "Logged out" });
});

router.use("/users", usersRoutes);
router.use("/tuitions", tuitionsRoutes);
router.use("/applications", applicationsRoutes);
router.use("/admin", adminRoutes);
router.use("/payments", paymentsRoutes);

export default router;
