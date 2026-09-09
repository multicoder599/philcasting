const express = require("express");
const mongoose = require("mongoose");
const { auth, adminOnly } = require("../middleware/auth");
const onfon = require("../services/onfon.service");
const User = require("../models/User");
const Transaction = require("../models/Transaction");
const MessageLog = require("../models/MessageLog");

const router = express.Router();
router.use(auth, adminOnly);

// Manual top-up after receiving M-Pesa payment (automate with Daraja STK later)
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

// DLR webhook from Onfon (configure the URL in the Onfon portal) - no JWT, validated separately
router.post("/dlr", async (req, res) => {
  // TODO: verify the webhook origin (shared secret header or source IP whitelist)
  const { MessageId, Status } = req.body || {};
  if (MessageId) await MessageLog.updateMany({ "onfonResponse.Data.MessageId": MessageId }, { dlrStatus: Status });
  res.json({ ok: true });
});

module.exports = router;
