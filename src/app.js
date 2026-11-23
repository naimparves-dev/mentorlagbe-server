import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import apiRoutes from "./routes/index.js";
import { stripeWebhookHandler } from "./routes/payments/index.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

const allowedOrigins = [
  env.CLIENT_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(cookieParser());

// Stripe webhook requires raw body BEFORE express.json()
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhookHandler
);

app.use(express.json({ limit: "5mb" }));

app.get("/", (_req, res) => {
  res.json({
    success: true,
    name: "MentorLagbe API Server",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
