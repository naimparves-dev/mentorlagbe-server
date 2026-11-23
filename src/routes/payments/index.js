import express from "express";
import { connectDB, getCollections } from "../../config/db.js";
import { env } from "../../config/env.js";
import { getStripe } from "../../config/stripe.js";
import { verifyToken } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

const router = express.Router();

async function fulfillProUpgrade(session) {
  const { db } = await connectDB();
  const { users, payments } = getCollections(db);

  const userEmail = session.metadata?.userEmail || session.customer_email;
  const userName = session.metadata?.userName || "MentorLagbe User";
  const userRole = session.metadata?.userRole || "student";
  const planName = session.metadata?.planName || "Pro Plan";
  const amount = (session.amount_total || 0) / 100;
  const currency = (session.currency || "usd").toUpperCase();
  const transactionId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || session.id;

  const existing = await payments.findOne({ stripeSessionId: session.id });
  if (!existing) {
    await payments.insertOne({
      userEmail,
      userName,
      userRole,
      planName,
      amount,
      currency,
      transactionId,
      stripeSessionId: session.id,
      paymentStatus: "paid",
      paidAt: new Date(),
    });
  }

  await users.updateOne(
    { email: userEmail },
    { $set: { plan: "pro", updatedAt: new Date() } }
  );

  return {
    userEmail,
    userName,
    userRole,
    planName,
    amount,
    currency,
    transactionId,
  };
}

// POST /api/payments/create-checkout-session
router.post(
  "/create-checkout-session",
  verifyToken,
  asyncHandler(async (req, res) => {
    if (req.user.plan === "pro") {
      return res.status(400).json({
        success: false,
        message: "You are already on the Pro Plan!",
      });
    }

    const stripe = getStripe();
    const isTutor = req.user.role === "tutor";
    const planName = isTutor ? "Pro Tutor Plan" : "Pro Student Plan";
    const unitAmount = isTutor ? 1500 : 1000;
    const description = isTutor
      ? "Unlimited tuition posts, verified Pro badge, and priority visibility."
      : "Unlimited tuition bookmarks and priority booking perks.";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: req.user.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `MentorLagbe ${planName}`,
              description,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        userEmail: req.user.email,
        userName: req.user.name,
        userRole: req.user.role,
        planName,
      },
      success_url: `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.CLIENT_URL}/payment/cancel`,
    });

    return res.json({
      success: true,
      url: session.url,
      sessionId: session.id,
    });
  })
);

// POST /api/payments/verify-session
router.post(
  "/verify-session",
  verifyToken,
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res
        .status(400)
        .json({ success: false, message: "sessionId is required" });
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment has not been completed yet.",
      });
    }

    const payment = await fulfillProUpgrade(session);

    return res.json({
      success: true,
      message: "Pro Plan activated successfully!",
      payment,
    });
  })
);

export async function stripeWebhookHandler(req, res) {
  try {
    const stripe = getStripe();
    const sig = req.headers["stripe-signature"];

    let event;
    if (env.STRIPE_WEBHOOK_SECRET && sig) {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        env.STRIPE_WEBHOOK_SECRET
      );
    } else {
      event = JSON.parse(req.body.toString());
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        await fulfillProUpgrade(session);
      }
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }
}

export default router;
