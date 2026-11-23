import jwt from "jsonwebtoken";
import { connectDB, getCollections } from "../config/db.js";
import { env } from "../config/env.js";

export function signAuthToken(user) {
  return jwt.sign(
    {
      userId: String(user._id || user.id),
      email: user.email,
      role: user.role || "student",
      name: user.name,
      plan: user.plan || "free",
    },
    env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/**
 * Challenge 2: verifyToken middleware
 */
export async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : req.cookies?.ml_token;

    if (!token) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: No token provided" });
    }

    const decoded = jwt.verify(token, env.JWT_SECRET);
    const { db } = await connectDB();
    const { users } = getCollections(db);

    const user = await users.findOne({ email: decoded.email });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized: User not found" });
    }

    req.user = {
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
    };

    next();
  } catch {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized: Invalid or expired token" });
  }
}

export function verifyStudent(req, res, next) {
  if (!req.user || req.user.role !== "student") {
    return res
      .status(403)
      .json({ success: false, message: "Forbidden: Student access required" });
  }
  next();
}

export function verifyTutor(req, res, next) {
  if (!req.user || req.user.role !== "tutor") {
    return res
      .status(403)
      .json({ success: false, message: "Forbidden: Tutor access required" });
  }
  next();
}

export function verifyAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, message: "Forbidden: Admin access required" });
  }
  next();
}
