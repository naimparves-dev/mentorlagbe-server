import express from "express";
import { ObjectId } from "mongodb";
import { connectDB, getCollections } from "../../config/db.js";
import { verifyToken, verifyAdmin } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = express.Router();

router.use(verifyToken, verifyAdmin);

// GET /api/admin/stats
router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const { db } = await connectDB();
    const { users, tuitions, payments } = getCollections(db);

    const [
      totalUsers,
      totalTutors,
      totalStudents,
      pendingTuitions,
      approvedTuitions,
      rejectedTuitions,
      revenueAgg,
    ] = await Promise.all([
      users.countDocuments(),
      users.countDocuments({ role: "tutor" }),
      users.countDocuments({ role: "student" }),
      tuitions.countDocuments({ approvalStatus: "pending" }),
      tuitions.countDocuments({ approvalStatus: "approved" }),
      tuitions.countDocuments({ approvalStatus: "rejected" }),
      payments
        .aggregate([
          { $match: { paymentStatus: "paid" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray(),
    ]);

    return res.json({
      success: true,
      stats: {
        totalUsers,
        totalTutors,
        totalStudents,
        pendingTuitions,
        approvedTuitions,
        rejectedTuitions,
        totalRevenue: revenueAgg[0]?.total || 0,
      },
    });
  })
);

// GET /api/admin/users
router.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const { db } = await connectDB();
    const { users } = getCollections(db);

    const list = await users
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, users: list });
  })
);

// PATCH /api/admin/users/:id/role
router.patch(
  "/users/:id/role",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!["student", "tutor", "admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role must be 'student', 'tutor', or 'admin'",
      });
    }

    const { db } = await connectDB();
    const { users } = getCollections(db);

    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
    const targetUser = await users.findOne(filter);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    await users.updateOne(filter, { $set: { role, updatedAt: new Date() } });

    return res.json({
      success: true,
      message: `Updated ${targetUser.name}'s role to ${role}`,
    });
  })
);

// GET /api/admin/tuitions
router.get(
  "/tuitions",
  asyncHandler(async (req, res) => {
    const { status } = req.query;
    const { db } = await connectDB();
    const { tuitions } = getCollections(db);

    const filter = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.approvalStatus = status;
    }

    const list = await tuitions.find(filter).sort({ createdAt: -1 }).toArray();
    return res.json({ success: true, tuitions: list });
  })
);

// PATCH /api/admin/tuitions/:id/status
router.patch(
  "/tuitions/:id/status",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { approvalStatus } = req.body;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid tuition ID" });
    }
    if (!["approved", "rejected", "pending"].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        message: "approvalStatus must be 'approved', 'rejected', or 'pending'",
      });
    }

    const { db } = await connectDB();
    const { tuitions } = getCollections(db);

    const result = await tuitions.updateOne(
      { _id: new ObjectId(id) },
      { $set: { approvalStatus, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Tuition not found" });
    }

    return res.json({
      success: true,
      message: `Tuition has been ${approvalStatus}`,
    });
  })
);

// GET /api/admin/transactions
router.get(
  "/transactions",
  asyncHandler(async (_req, res) => {
    const { db } = await connectDB();
    const { payments } = getCollections(db);

    const list = await payments.find().sort({ paidAt: -1 }).toArray();
    return res.json({ success: true, transactions: list });
  })
);

export default router;
