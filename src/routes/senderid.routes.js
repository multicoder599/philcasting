const express = require("express");
const { auth, adminOnly } = require("../middleware/auth");
const SenderId = require("../models/SenderId");

const router = express.Router();

// Request a sender ID (must then be approved by admin AND registered on the Onfon portal)
router.post("/", auth, async (req, res) => {
  const raw = String(req.body?.value || "");
  const value = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11); // max 11 alphanumeric
  if (value.length < 3)
    return res.status(400).json({ error: "Sender ID must be 3-11 letters/numbers" });
  const exists = await SenderId.findOne({ value });
  if (exists) return res.status(409).json({ error: "Sender ID already taken" });
  const count = await SenderId.countDocuments({ user: req.user.id });
  if (count >= 5) return res.status(400).json({ error: "Maximum 5 sender IDs per account" });
  const sid = await SenderId.create({ user: req.user.id, value, status: "pending" });
  res.status(201).json({ ok: true, senderId: sid, note: "Pending admin approval" });
});

router.get("/mine", auth, async (req, res) => {
  const ids = await SenderId.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.json(ids);
});

// ---- Admin ----
router.get("/admin/pending", auth, adminOnly, async (req, res) => {
  res.json(await SenderId.find({ status: "pending" }).populate("user", "name email"));
});

router.post("/admin/:id/approve", auth, adminOnly, async (req, res) => {
  const sid = await SenderId.findByIdAndUpdate(req.params.id, { status: "approved" }, { new: true });
  if (!sid) return res.status(404).json({ error: "Not found" });
  // TODO: also register this sender ID in the Onfon reseller portal so it is network-approved
  res.json({ ok: true, senderId: sid });
});

router.post("/admin/:id/reject", auth, adminOnly, async (req, res) => {
  const sid = await SenderId.findByIdAndUpdate(req.params.id, { status: "rejected" }, { new: true });
  if (!sid) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

module.exports = router;
