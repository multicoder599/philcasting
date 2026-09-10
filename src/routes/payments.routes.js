const express = require("express");
const mongoose = require("mongoose");
const { auth } = require("../middleware/auth");
const megapay = require("../services/megapay.service");
const Payment = require("../models/Payment");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const router = express.Router();

// Initiate an M-Pesa STK top-up (user must be logged in)
router.post("/stk", auth, async (req, res) => {
  const amount = Number(req.body?.amount);
  const phone = String(req.body?.phone || "").trim();
  if (!amount || amount < 10) return res.status(400).json({ error: "Minimum top-up is KES 10" });
  if (amount > 150000) return res.status(400).json({ error: "Maximum top-up is KES 150,000" });

  const reference = "PC-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
  await Payment.create({ user: req.user.id, reference, amount, phone, status: "pending" });

  try {
    const r = await megapay.initiateSTK({ phone, amount, reference });
    if (r?.CheckoutRequestID) {
      await Payment.findOneAndUpdate({ reference }, { checkoutRequestId: r.CheckoutRequestID });
    }
    res.json({ ok: true, reference, megapay: r, message: "Check your phone and enter your M-Pesa PIN" });
  } catch (e) {
    await Payment.findOneAndUpdate({ reference }, { status: "failed", failureReason: e.message });
    res.status(e.status || 502).json({ error: e.message });
  }
});

// Poll local payment status (webhook usually lands within seconds)
router.get("/status/:reference", auth, async (req, res) => {
  const p = await Payment.findOne({ reference: req.params.reference, user: req.user.id });
  if (!p) return res.status(404).json({ error: "Payment not found" });
  res.json({ status: p.status, amount: p.amount, receipt: p.receipt });
});

// MegaPay webhook - credits the wallet. NO JWT - protected by shared secret.
router.post("/callback", async (req, res) => {
  if (req.headers["x-callback-secret"] !== process.env.MEGAPAY_CALLBACK_SECRET)
    return res.status(401).json({ error: "Unauthorized" });

  const b = req.body || {};
  const reference = b.TransactionReference;
  if (!reference) return res.status(400).json({ error: "No reference" });

  const payment = await Payment.findOne({ reference });
  if (!payment) return res.status(404).json({ error: "Unknown reference" });
  if (payment.status === "completed") return res.json({ ok: true }); // idempotent - never double-credit

  if (String(b.ResponseCode) === "0" && Number(b.TransactionAmount) >= payment.amount) {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await Payment.findOneAndUpdate({ reference }, {
        status: "completed", receipt: b.TransactionReceipt || null,
      }, { session });
      const user = await User.findByIdAndUpdate(payment.user, { $inc: { walletBalance: payment.amount } }, { session, new: true });
      await Transaction.create([{
        user: payment.user, type: "topup", amount: payment.amount,
        reference: b.TransactionReceipt || reference,
      }], { session });
      console.log(`Credited ${user.email} +KES ${payment.amount} (${reference})`);
    });
  } else {
    await Payment.findOneAndUpdate({ reference }, {
      status: "failed", failureReason: b.ResponseDescription || "Payment not completed",
    });
  }
  res.json({ ok: true });
});

module.exports = router;
