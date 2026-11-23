import express from "express";
import { ObjectId } from "mongodb";
import { connectDB, getCollections } from "../../config/db.js";
import {
  verifyToken,
  verifyStudent,
  verifyTutor,
} from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = express.Router();

// POST /api/applications
router.post(
  "/",
  verifyToken,
  verifyStudent,
  asyncHandler(async (req, res) => {
    const { tuitionId, studentPhone, preferredSchedule, studentNote } = req.body;

    if (!tuitionId || !ObjectId.isValid(tuitionId)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid tuitionId is required" });
    }
    if (!studentPhone?.trim() || !preferredSchedule?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number and preferred schedule are required",
      });
    }

    const { db } = await connectDB();
    const { tuitions, applications } = getCollections(db);

    const tuition = await tuitions.findOne({
      _id: new ObjectId(tuitionId),
      approvalStatus: "approved",
      isActive: true,
    });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Tuition is not available for applications",
      });
    }

    const duplicate = await applications.findOne({
      tuitionId: String(tuition._id),
      studentEmail: req.user.email,
    });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "You have already applied for this tuition.",
      });
    }

    const doc = {
      tuitionId: String(tuition._id),
      tuitionTitle: tuition.title,
      subject: tuition.subject,
      monthlyFee: tuition.monthlyFee,
      tutorName: tuition.tutorName,
      tutorEmail: tuition.tutorEmail,
      studentName: req.user.name,
      studentEmail: req.user.email,
      studentPhone: studentPhone.trim(),
      preferredSchedule: preferredSchedule.trim(),
      studentNote: String(studentNote || "").trim(),
      status: "pending",
      appliedAt: new Date(),
    };

    const result = await applications.insertOne(doc);

    return res.status(201).json({
      success: true,
      message: "Application submitted successfully!",
      application: { ...doc, _id: result.insertedId },
    });
  })
);

// GET /api/applications/student
router.get(
  "/student",
  verifyToken,
  verifyStudent,
  asyncHandler(async (req, res) => {
    const { db } = await connectDB();
    const { applications } = getCollections(db);

    const items = await applications
      .find({ studentEmail: req.user.email })
      .sort({ appliedAt: -1 })
      .toArray();

    return res.json({ success: true, applications: items });
  })
);

// GET /api/applications/student/stats
router.get(
  "/student/stats",
  verifyToken,
  verifyStudent,
  asyncHandler(async (req, res) => {
    const { db } = await connectDB();
    const { applications } = getCollections(db);

    const [totalApplied, accepted, pending, rejected] = await Promise.all([
      applications.countDocuments({ studentEmail: req.user.email }),
      applications.countDocuments({
        studentEmail: req.user.email,
        status: "accepted",
      }),
      applications.countDocuments({
        studentEmail: req.user.email,
        status: "pending",
      }),
      applications.countDocuments({
        studentEmail: req.user.email,
        status: "rejected",
      }),
    ]);

    return res.json({
      success: true,
      stats: {
        totalApplied,
        accepted,
        pending,
        rejected,
        bookmarksCount: (req.user.bookmarks || []).length,
        plan: req.user.plan,
      },
    });
  })
);

// DELETE /api/applications/student/:id
router.delete(
  "/student/:id",
  verifyToken,
  verifyStudent,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid application ID" });
    }

    const { db } = await connectDB();
    const { applications } = getCollections(db);

    const appDoc = await applications.findOne({
      _id: new ObjectId(id),
      studentEmail: req.user.email,
    });

    if (!appDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }
    if (appDoc.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending applications can be cancelled.",
      });
    }

    await applications.deleteOne({ _id: new ObjectId(id) });
    return res.json({
      success: true,
      message: "Application cancelled successfully",
    });
  })
);

// GET /api/applications/tutor
router.get(
  "/tutor",
  verifyToken,
  verifyTutor,
  asyncHandler(async (req, res) => {
    const { db } = await connectDB();
    const { applications } = getCollections(db);

    const items = await applications
      .find({ tutorEmail: req.user.email })
      .sort({ appliedAt: -1 })
      .toArray();

    return res.json({ success: true, applications: items });
  })
);

// PATCH /api/applications/tutor/:id
router.patch(
  "/tutor/:id",
  verifyToken,
  verifyTutor,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid application ID" });
    }
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be 'accepted' or 'rejected'",
      });
    }

    const { db } = await connectDB();
    const { applications } = getCollections(db);

    const result = await applications.updateOne(
      { _id: new ObjectId(id), tutorEmail: req.user.email },
      { $set: { status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Application not found or unauthorized",
      });
    }

    return res.json({ success: true, message: `Application marked as ${status}` });
  })
);

export default router;
