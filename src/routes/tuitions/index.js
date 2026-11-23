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

// GET /api/tuitions/featured
router.get(
  "/featured",
  asyncHandler(async (_req, res) => {
    const { db } = await connectDB();
    const { tuitions } = getCollections(db);

    const items = await tuitions
      .find({ approvalStatus: "approved", isActive: true })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();

    return res.json({ success: true, tuitions: items });
  })
);

// GET /api/tuitions — Server-side Search, Filter & Pagination
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const {
      search = "",
      subject = "",
      classLevel = "",
      mode = "",
      sort = "newest",
      page = "1",
      limit = "9",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(24, Math.max(1, parseInt(limit, 10) || 9));
    const skip = (pageNum - 1) * limitNum;

    const filter = { approvalStatus: "approved", isActive: true };

    if (search && String(search).trim()) {
      const regex = new RegExp(String(search).trim(), "i");
      filter.$or = [
        { title: regex },
        { subject: regex },
        { location: regex },
        { tutorName: regex },
      ];
    }

    if (subject && subject !== "all") {
      filter.subject = new RegExp(`^${String(subject).trim()}$`, "i");
    }

    if (classLevel && classLevel !== "all") {
      filter.classLevel = String(classLevel).trim();
    }

    if (mode && mode !== "all") {
      filter.mode = String(mode).trim();
    }

    let sortObj = { createdAt: -1 };
    if (sort === "fee_asc") sortObj = { monthlyFee: 1 };
    if (sort === "fee_desc") sortObj = { monthlyFee: -1 };

    const { db } = await connectDB();
    const { tuitions } = getCollections(db);

    const [items, total] = await Promise.all([
      tuitions.find(filter).sort(sortObj).skip(skip).limit(limitNum).toArray(),
      tuitions.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      tuitions: items,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  })
);

// GET /api/tuitions/tutor/my-tuitions
router.get(
  "/tutor/my-tuitions",
  verifyToken,
  verifyTutor,
  asyncHandler(async (req, res) => {
    const { db } = await connectDB();
    const { tuitions } = getCollections(db);

    const items = await tuitions
      .find({ tutorEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ success: true, tuitions: items });
  })
);

// GET /api/tuitions/tutor/stats
router.get(
  "/tutor/stats",
  verifyToken,
  verifyTutor,
  asyncHandler(async (req, res) => {
    const { db } = await connectDB();
    const { tuitions, applications } = getCollections(db);

    const [totalPosted, activeApproved, pendingApproval, totalApplicants] =
      await Promise.all([
        tuitions.countDocuments({ tutorEmail: req.user.email }),
        tuitions.countDocuments({
          tutorEmail: req.user.email,
          approvalStatus: "approved",
          isActive: true,
        }),
        tuitions.countDocuments({
          tutorEmail: req.user.email,
          approvalStatus: "pending",
        }),
        applications.countDocuments({ tutorEmail: req.user.email }),
      ]);

    return res.json({
      success: true,
      stats: {
        totalPosted,
        activeApproved,
        pendingApproval,
        totalApplicants,
        plan: req.user.plan,
        postLimit: req.user.plan === "pro" ? null : 2,
      },
    });
  })
);

// POST /api/tuitions
router.post(
  "/",
  verifyToken,
  verifyTutor,
  asyncHandler(async (req, res) => {
    const {
      title,
      subject,
      classLevel,
      mode,
      location,
      monthlyFee,
      daysPerWeek,
      bannerImage,
      description,
    } = req.body;

    if (
      !title?.trim() ||
      !subject?.trim() ||
      !classLevel?.trim() ||
      !mode?.trim() ||
      !monthlyFee ||
      !daysPerWeek
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required tuition fields.",
      });
    }

    const { db } = await connectDB();
    const { tuitions } = getCollections(db);

    if (req.user.plan !== "pro") {
      const existingCount = await tuitions.countDocuments({
        tutorEmail: req.user.email,
      });
      if (existingCount >= 2) {
        return res.status(403).json({
          success: false,
          code: "POST_LIMIT_REACHED",
          message:
            "Free Plan Tutors can post up to 2 tuitions. Upgrade to Pro Tutor ($15) for unlimited tuition posts!",
        });
      }
    }

    const doc = {
      title: title.trim(),
      subject: subject.trim(),
      classLevel: classLevel.trim(),
      mode: mode === "Offline" ? "Offline" : "Online",
      location:
        location?.trim() ||
        (mode === "Online" ? "Online (Zoom / Google Meet)" : "Dhaka"),
      monthlyFee: Number(monthlyFee),
      daysPerWeek: Number(daysPerWeek),
      bannerImage:
        bannerImage?.trim() ||
        "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80",
      description: description?.trim() || "",
      tutorName: req.user.name,
      tutorEmail: req.user.email,
      approvalStatus: "pending",
      isActive: true,
      reviews: [],
      createdAt: new Date(),
    };

    const result = await tuitions.insertOne(doc);

    return res.status(201).json({
      success: true,
      message: "Tuition posted! Waiting for Admin approval.",
      tuition: { ...doc, _id: result.insertedId },
    });
  })
);

// GET /api/tuitions/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid tuition ID" });
    }

    const { db } = await connectDB();
    const { tuitions, users } = getCollections(db);

    const tuition = await tuitions.findOne({ _id: new ObjectId(id) });
    if (!tuition) {
      return res
        .status(404)
        .json({ success: false, message: "Tuition listing not found" });
    }

    const tutor = await users.findOne(
      { email: tuition.tutorEmail },
      { projection: { name: 1, email: 1, image: 1, bio: 1, phone: 1, plan: 1 } }
    );

    return res.json({
      success: true,
      tuition,
      tutor: tutor || {
        name: tuition.tutorName,
        email: tuition.tutorEmail,
        image: "",
        bio: "Experienced educator on MentorLagbe.",
        plan: "free",
      },
    });
  })
);

// PATCH /api/tuitions/:id
router.patch(
  "/:id",
  verifyToken,
  verifyTutor,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid tuition ID" });
    }

    const { db } = await connectDB();
    const { tuitions } = getCollections(db);

    const existing = await tuitions.findOne({
      _id: new ObjectId(id),
      tutorEmail: req.user.email,
    });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Tuition not found or unauthorized",
      });
    }

    const allowedFields = [
      "title",
      "subject",
      "classLevel",
      "mode",
      "location",
      "monthlyFee",
      "daysPerWeek",
      "bannerImage",
      "description",
      "isActive",
    ];
    const updates = { updatedAt: new Date() };
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        if (key === "monthlyFee" || key === "daysPerWeek") {
          updates[key] = Number(req.body[key]);
        } else if (key === "isActive") {
          updates[key] = Boolean(req.body[key]);
        } else {
          updates[key] = String(req.body[key]).trim();
        }
      }
    }

    await tuitions.updateOne({ _id: new ObjectId(id) }, { $set: updates });
    const updated = await tuitions.findOne({ _id: new ObjectId(id) });

    return res.json({
      success: true,
      message: "Tuition updated successfully",
      tuition: updated,
    });
  })
);

// DELETE /api/tuitions/:id
router.delete(
  "/:id",
  verifyToken,
  verifyTutor,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid tuition ID" });
    }

    const { db } = await connectDB();
    const { tuitions, applications } = getCollections(db);

    const result = await tuitions.deleteOne({
      _id: new ObjectId(id),
      tutorEmail: req.user.email,
    });

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Tuition not found or unauthorized" });
    }

    await applications.deleteMany({ tuitionId: id });
    return res.json({ success: true, message: "Tuition deleted successfully" });
  })
);

// POST /api/tuitions/:id/reviews
router.post(
  "/:id/reviews",
  verifyToken,
  verifyStudent,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (!ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid tuition ID" });
    }

    const numRating = Number(rating);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res
        .status(400)
        .json({ success: false, message: "Rating must be between 1 and 5." });
    }

    const { db } = await connectDB();
    const { tuitions, applications } = getCollections(db);

    const acceptedApp = await applications.findOne({
      tuitionId: id,
      studentEmail: req.user.email,
      status: "accepted",
    });

    if (!acceptedApp) {
      return res.status(403).json({
        success: false,
        message:
          "Only students with an accepted application for this tuition can leave a review.",
      });
    }

    const tuition = await tuitions.findOne({ _id: new ObjectId(id) });
    if (!tuition) {
      return res
        .status(404)
        .json({ success: false, message: "Tuition not found" });
    }

    if ((tuition.reviews || []).some((r) => r.studentEmail === req.user.email)) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this tuition.",
      });
    }

    const review = {
      studentEmail: req.user.email,
      studentName: req.user.name,
      rating: numRating,
      comment: String(comment || "").trim(),
      createdAt: new Date(),
    };

    await tuitions.updateOne(
      { _id: new ObjectId(id) },
      { $push: { reviews: review } }
    );

    return res
      .status(201)
      .json({ success: true, message: "Thank you for your review!", review });
  })
);

export default router;
