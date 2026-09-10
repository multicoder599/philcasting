const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { auth, adminOnly } = require("../middleware/auth");
const SenderId = require("../models/SenderId");

const router = express.Router();

// ---- document uploads (KYC for OnfonMedia portal submission) ----
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + Math.random().toString(36).slice(2, 8) + path.extname(file.originalname).toLowerCase()),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PDF, JPG or PNG documents allowed"), ok);
  },
});

// Apply for a sender ID (multipart: fields + up to 3 KYC documents)
router.post("/", auth, (req, res) => {
  upload.fields([
    { name: "certificate", maxCount: 1 },
    { name: "permit", maxCount: 1 },
    { name: "idCopy", maxCount: 1 },
  ])(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const raw = String(req.body?.value || "");
      const value = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
      if (value.length < 3) return res.status(400).json({ error: "Sender ID must be 3-11 letters/numbers" });
      if (!String(req.body?.businessName || "").trim()) return res.status(400).json({ error: "Business name is required" });
      if (!String(req.body?.purpose || "").trim()) return res.status(400).json({ error: "Purpose is required" });

      const exists = await SenderId.findOne({ value });
      if (exists) return res.status(409).json({ error: "Sender ID already taken" });
      const count = await SenderId.countDocuments({ user: req.user.id });
      if (count >= 5) return res.status(400).json({ error: "Maximum 5 sender IDs per account" });

      const documents = [];
      for (const [field, files] of Object.entries(req.files || {})) {
        for (const f of files) documents.push({ field, originalName: f.originalname, path: f.path });
      }

      const sid = await SenderId.create({
        user: req.user.id, value, status: "pending",
        businessName: String(req.body.businessName).trim(),
        purpose: String(req.body.purpose).trim(),
        contactPhone: String(req.body.contactPhone || "").trim(),
        documents,
      });
      res.status(201).json({ ok: true, senderId: sid, note: "Application received — we will submit it to the networks within 24h" });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

router.get("/mine", auth, async (req, res) => {
  const ids = await SenderId.find({ user: req.user.id }).sort({ createdAt: -1 });
  res.json(ids);
});

// ---- Admin ----
router.get("/admin/pending", auth, adminOnly, async (req, res) => {
  res.json(await SenderId.find({ status: "pending" }).populate("user", "name email"));
});

router.get("/admin/all", auth, adminOnly, async (req, res) => {
  res.json(await SenderId.find().populate("user", "name email").sort({ createdAt: -1 }).limit(200));
});

router.get("/admin/document/:sidId/:index", auth, adminOnly, async (req, res) => {
  const sid = await SenderId.findById(req.params.sidId);
  const doc = sid?.documents?.[Number(req.params.index)];
  if (!doc || !fs.existsSync(doc.path)) return res.status(404).json({ error: "Document not found" });
  res.download(doc.path, doc.originalName);
});

router.post("/admin/:id/approve", auth, adminOnly, async (req, res) => {
  const sid = await SenderId.findByIdAndUpdate(req.params.id, { status: "approved" }, { new: true });
  if (!sid) return res.status(404).json({ error: "Not found" });
  // Also register this sender ID (with its KYC docs) in the OnfonMedia portal
  res.json({ ok: true, senderId: sid });
});

// Mark as submitted to Onfon portal (use after you upload docs there)
router.post("/admin/:id/submitted", auth, adminOnly, async (req, res) => {
  const sid = await SenderId.findByIdAndUpdate(req.params.id, { status: "submitted" }, { new: true });
  if (!sid) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

router.post("/admin/:id/reject", auth, adminOnly, async (req, res) => {
  const sid = await SenderId.findByIdAndUpdate(req.params.id, { status: "rejected" }, { new: true });
  if (!sid) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

module.exports = router;
