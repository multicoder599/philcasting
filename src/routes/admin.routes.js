const express = require("express");
const mongoose = require("mongoose");
const { auth, adminOnly } = require("../middleware/auth");
const onfon = require("../services/onfon.service");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const MessageLog = require("../models/MessageLog");
const Payment = require("../models/Payment");
const SenderId = require("../models/SenderId");

const router = express.Router();
router.use(auth, adminOnly);

// Dashboard stats
router.get("/stats", async (req, res) => {
  const [users, pendingSids, revenueAgg, messagesToday] = await Promise.all([
    User.countDocuments({ role: "user" }),
    SenderId.countDocuments({ status: "pending" }),
    Transaction.aggregate([{ $match: { type: "topup" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    MessageLog.countDocuments({ createdAt: { $gte: new Date(Date.now() - 864e5) } }),
  ]);
  res.json({
    users,
    pendingSenderIds: pendingSids,
    totalTopups: revenueAgg[0]?.total || 0,
    messages24h: messagesToday,
  });
});

// All users (for management + manual credit)
router.get("/users", async (req, res) => {
  const users = await User.find().select("name email role walletBalance createdAt").sort({ createdAt: -1 }).limit(200);
  res.json(users);
});

// All payments
router.get("/payments", async (req, res) => {
  const payments = await Payment.find().populate("user", "name email").sort({ createdAt: -1 }).limit(200);
  res.json(payments);
});

// Manual top-up (keep as fallback for cash payments)
router.post("/wallet/credit", async (req, res) => {
  const { userId, amount, reference } = req.body || {};
  const amt = Number(amount);
  if (!userId || !amt || amt <= 0) return res.status(400).json({ error: "userId and positive amount required" });

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    const user = await User.findByIdAndUpdate(userId, { $inc: { walletBalance: amt } }, { session, new: true });
    if (!user) throw Object.assign(new Error("User not found"), { status: 404 });
    await Transaction.create([{ user: userId, type: "topup", amount: amt, reference: reference || "manual" }], { session });
  });
  res.json({ ok: true });
});

// Check your OnfonMedia reseller balance
router.get("/onfon-balance", async (req, res) => {
  try {
    res.json(await onfon.getBalance());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// DLR webhook from Onfon (configure URL in the Onfon portal) - no JWT, validated separately
router.post("/dlr", async (req, res) => {
  const { MessageId, Status } = req.body || {};
  if (MessageId) await MessageLog.updateMany({ "onfonResponse.Data.MessageId": MessageId }, { dlrStatus: Status });
  res.json({ ok: true });
});

module.exports = router;
