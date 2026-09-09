const express = require("express");
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");
const onfon = require("../services/onfon.service");
const User = require("../models/User");
const SenderId = require("../models/SenderId");
const MessageLog = require("../models/MessageLog");
const Transaction = require("../models/Transaction");

const router = express.Router();

// Send SMS: validates sender ID, atomically debits wallet, calls Onfon, logs everything.
router.post("/send", auth, async (req, res) => {
  const { senderId, recipients, text } = req.body || {};
  if (!senderId || !Array.isArray(recipients) || recipients.length === 0 || !text)
    return res.status(400).json({ error: "senderId, recipients[] and text are required" });
  if (recipients.length > 1000) return res.status(400).json({ error: "Max 1000 recipients per request" });
  if (text.length > 1000) return res.status(400).json({ error: "Text too long" });

  const price = Number(process.env.SELL_PRICE_PER_SMS_KES || 1);
  const total = +(price * recipients.length).toFixed(2);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const sid = await SenderId.findOne({
        user: req.user.id, value: String(senderId).toUpperCase(), status: "approved",
      }).session(session);
      if (!sid) throw Object.assign(new Error("Sender ID not approved for your account"), { status: 400 });

      // Atomic debit - only succeeds if balance >= total
      const user = await User.findOneAndUpdate(
        { _id: req.user.id, walletBalance: { $gte: total } },
        { $inc: { walletBalance: -total } },
        { session, new: true }
      );
      if (!user) throw Object.assign(new Error("Insufficient tokens"), { status: 402 });

      const params = recipients.map((n) => ({ Number: String(n), Text: text }));
      result = await onfon.sendBulkSMS(sid.value, params);
      const ok = result?.ErrorCode === "000";

      await Transaction.create(
        [{ user: req.user.id, type: "debit", amount: total, reference: result?.Data?.[0]?.MessageId || null }],
        { session }
      );
      await MessageLog.create(
        [{ user: req.user.id, senderId: sid.value, recipients, text, cost: total,
           status: ok ? "sent" : "failed", onfonResponse: result }],
        { session }
      );

      if (!ok) {
        // Onfon rejected - refund immediately so the user is not charged
        await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalance: total } }, { session });
        await Transaction.create([{ user: req.user.id, type: "refund", amount: total }], { session });
      }
    });
    res.json({ ok: result?.ErrorCode === "000", onfon: result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  } finally {
    session.endSession();
  }
});

router.get("/history", auth, async (req, res) => {
  const logs = await MessageLog.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(100);
  res.json(logs);
});

module.exports = router;
