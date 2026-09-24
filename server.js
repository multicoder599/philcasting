/* =========================================================================
   PhilCasting — single-file backend (v6)
   Everything: config, models, middleware, services, routes.
   ========================================================================= */
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 4030;
const JWT_SECRET = process.env.JWT_SECRET;
const RATE = Number(process.env.SELL_PRICE_PER_SMS_KES || 1);
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ============================== MODELS ============================== */
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  walletBalance: { type: Number, default: 0, min: 0 },
}, { timestamps: true });
const User = mongoose.model("User", userSchema);

const documentSchema = new mongoose.Schema({
  field: { type: String, enum: ["certificate", "permit", "idCopy"] },
  originalName: String,
  path: String,
}, { _id: false });
const senderIdSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  value: { type: String, required: true, unique: true, uppercase: true, maxlength: 11 },
  status: { type: String, enum: ["pending", "submitted", "approved", "rejected"], default: "pending", index: true },
  businessName: { type: String, trim: true, default: "" },
  purpose: { type: String, trim: true, default: "" },
  contactPhone: { type: String, trim: true, default: "" },
  documents: { type: [documentSchema], default: [] },
}, { timestamps: true });
const SenderId = mongoose.model("SenderId", senderIdSchema);

const messageLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  senderId: { type: String, required: true },
  recipients: [{ type: String }],
  text: { type: String, required: true },
  cost: { type: Number, required: true },
  status: { type: String, enum: ["sent", "failed"], required: true },
  onfonResponse: { type: mongoose.Schema.Types.Mixed },
  dlrStatus: { type: String, default: null },
}, { timestamps: true });
const MessageLog = mongoose.model("MessageLog", messageLogSchema);

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["topup", "debit", "refund"], required: true },
  amount: { type: Number, required: true, min: 0 },
  reference: { type: String, default: null },
}, { timestamps: true });
const Transaction = mongoose.model("Transaction", transactionSchema);

const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  reference: { type: String, required: true, unique: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  phone: { type: String, required: true },
  status: { type: String, enum: ["pending", "completed", "failed"], default: "pending", index: true },
  receipt: { type: String, default: null },
  checkoutRequestId: { type: String, default: null },
  failureReason: { type: String, default: null },
}, { timestamps: true });
const Payment = mongoose.model("Payment", paymentSchema);

/* ============================ MIDDLEWARE ============================ */
function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  next();
}
const sign = (u) => jwt.sign({ id: u._id, role: u.role }, JWT_SECRET, { expiresIn: "7d" });

/* ============================= SERVICES ============================= */
const ONFON = {
  accessKey: process.env.ONFON_ACCESS_KEY,
  clientId: process.env.ONFON_CLIENT_ID,
  apiKey: process.env.ONFON_API_KEY,
  baseUrl: process.env.ONFON_BASE_URL || "https://api.onfonmedia.co.ke/v1",
};
async function onfonSend(senderId, recipients) {
  const res = await fetch(`${ONFON.baseUrl}/sms/SendBulkSMS`, {
    method: "POST",
    headers: { Accesskey: ONFON.accessKey, "Content-Type": "application/json" },
    body: JSON.stringify({ SenderId: senderId, MessageParameters: recipients, ApiKey: ONFON.apiKey, ClientId: ONFON.clientId }),
  });
  if (!res.ok) throw new Error(`Onfon HTTP ${res.status}`);
  return res.json(); // ErrorCode "000" = success
}
async function onfonBalance() {
  const url = `${ONFON.baseUrl}/Balance?ApiKey=${ONFON.apiKey}&ClientId=${ONFON.clientId}`;
  const res = await fetch(url, { headers: { Accesskey: ONFON.accessKey } });
  if (!res.ok) throw new Error(`Onfon HTTP ${res.status}`);
  return res.json();
}

async function megapaySTK({ phone, amount, reference }) {
  const apiKey = process.env.MEGAPAY_API_KEY, email = process.env.MEGAPAY_EMAIL;
  if (!apiKey || !email) throw new Error("MegaPay not configured on server");
  let msisdn = String(phone).trim();
  if (msisdn.startsWith("0")) msisdn = "254" + msisdn.slice(1);
  if (msisdn.startsWith("+")) msisdn = msisdn.slice(1);
  if (!/^2547\d{8}$/.test(msisdn)) throw Object.assign(new Error("Enter a valid Safaricom number"), { status: 400 });
  const res = await fetch("https://megapay.co.ke/backend/v1/initiatestk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, email, amount: String(Math.round(amount)), msisdn, reference }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `MegaPay HTTP ${res.status}`);
  return data;
}

/* ============================ UPLOAD SETUP =========================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + Math.random().toString(36).slice(2, 8) + path.extname(file.originalname).toLowerCase()),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["application/pdf", "image/jpeg", "image/png"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PDF, JPG or PNG documents allowed"), ok);
  },
});

/* =============================== APP ================================ */
const app = express();
app.use(express.json({ limit: "2mb" }));

const ALLOWED = [
  "https://philcasting.com",
  "https://www.philcasting.com",
  "https://philcasting.newtonmulti.workers.dev",
  "https://admin.philcasting.com",
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED.includes(origin)) res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ------------------------------ AUTH ------------------------------- */
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: "name, email and password (min 6 chars) required" });
  if (await User.findOne({ email: email.toLowerCase() }))
    return res.status(409).json({ error: "Email already registered" });
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: sign(user), user: { id: user._id, name, email, role: user.role } });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: (email || "").toLowerCase() });
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash)))
    return res.status(401).json({ error: "Invalid credentials" });
  res.json({ token: sign(user), user: { id: user._id, name: user.name, email: user.email, role: user.role, walletBalance: user.walletBalance } });
});

/* ----------------------------- WALLET ------------------------------ */
app.get("/api/wallet/balance", auth, async (req, res) => {
  const u = await User.findById(req.user.id).select("walletBalance");
  res.json({ walletBalance: u.walletBalance });
});
app.get("/api/wallet/transactions", auth, async (req, res) => {
  res.json(await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(100));
});

/* ---------------------------- SENDER IDS ---------------------------- */
app.post("/api/senderids", auth, (req, res) => {
  upload.fields([
    { name: "certificate", maxCount: 1 },
    { name: "permit", maxCount: 1 },
    { name: "idCopy", maxCount: 1 },
  ])(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const value = String(req.body?.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
      if (value.length < 3) return res.status(400).json({ error: "Sender ID must be 3-11 letters/numbers" });
      if (!String(req.body?.businessName || "").trim()) return res.status(400).json({ error: "Business name is required" });
      if (!String(req.body?.purpose || "").trim()) return res.status(400).json({ error: "Purpose is required" });
      if (await SenderId.findOne({ value })) return res.status(409).json({ error: "Sender ID already taken" });
      if ((await SenderId.countDocuments({ user: req.user.id })) >= 5)
        return res.status(400).json({ error: "Maximum 5 sender IDs per account" });

      const documents = [];
      for (const [field, files] of Object.entries(req.files || {}))
        for (const f of files) documents.push({ field, originalName: f.originalname, path: f.path });

      const sid = await SenderId.create({
        user: req.user.id, value, status: "pending",
        businessName: String(req.body.businessName).trim(),
        purpose: String(req.body.purpose).trim(),
        contactPhone: String(req.body.contactPhone || "").trim(),
        documents,
      });
      res.status(201).json({ ok: true, senderId: sid, note: "Application received — submitted to the networks within 24h" });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});
app.get("/api/senderids/mine", auth, async (req, res) => {
  res.json(await SenderId.find({ user: req.user.id }).sort({ createdAt: -1 }));
});

/* ------------------------------- SMS -------------------------------- */
app.post("/api/sms/send", auth, async (req, res) => {
  const { senderId, recipients, text } = req.body || {};
  if (!senderId || !Array.isArray(recipients) || !recipients.length || !text)
    return res.status(400).json({ error: "senderId, recipients[] and text are required" });
  if (recipients.length > 1000) return res.status(400).json({ error: "Max 1000 recipients per request" });
  if (text.length > 1000) return res.status(400).json({ error: "Text too long" });

  const total = +(RATE * recipients.length).toFixed(2);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const sid = await SenderId.findOne({ user: req.user.id, value: String(senderId).toUpperCase(), status: "approved" }).session(session);
      if (!sid) throw Object.assign(new Error("Sender ID not approved for your account"), { status: 400 });

      const user = await User.findOneAndUpdate(
        { _id: req.user.id, walletBalance: { $gte: total } },
        { $inc: { walletBalance: -total } }, { session, new: true });
      if (!user) throw Object.assign(new Error("Insufficient tokens"), { status: 402 });

      const params = recipients.map((n) => ({ Number: String(n), Text: text }));
      result = await onfonSend(sid.value, params);
      const ok = result?.ErrorCode === "000";

      await Transaction.create([{ user: req.user.id, type: "debit", amount: total, reference: result?.Data?.[0]?.MessageId || null }], { session });
      await MessageLog.create([{ user: req.user.id, senderId: sid.value, recipients, text, cost: total, status: ok ? "sent" : "failed", onfonResponse: result }], { session });

      if (!ok) { // refund on gateway rejection
        await User.findByIdAndUpdate(req.user.id, { $inc: { walletBalance: total } }, { session });
        await Transaction.create([{ user: req.user.id, type: "refund", amount: total }], { session });
      }
    });
    res.json({ ok: result?.ErrorCode === "000", onfon: result });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  } finally { session.endSession(); }
});
app.get("/api/sms/history", auth, async (req, res) => {
  res.json(await MessageLog.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(100));
});

/* ----------------------------- PAYMENTS ----------------------------- */
app.post("/api/payments/stk", auth, async (req, res) => {
  const amount = Number(req.body?.amount);
  const phone = String(req.body?.phone || "").trim();
  if (!amount || amount < 10) return res.status(400).json({ error: "Minimum top-up is KES 10" });
  if (amount > 150000) return res.status(400).json({ error: "Maximum top-up is KES 150,000" });
  const reference = "PC-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 900 + 100);
  await Payment.create({ user: req.user.id, reference, amount, phone, status: "pending" });
  try {
    const r = await megapaySTK({ phone, amount, reference });
    if (r?.CheckoutRequestID) await Payment.findOneAndUpdate({ reference }, { checkoutRequestId: r.CheckoutRequestID });
    res.json({ ok: true, reference, megapay: r, message: "Check your phone and enter your M-Pesa PIN" });
  } catch (e) {
    await Payment.findOneAndUpdate({ reference }, { status: "failed", failureReason: e.message });
    res.status(e.status || 502).json({ error: e.message });
  }
});
app.get("/api/payments/status/:reference", auth, async (req, res) => {
  const p = await Payment.findOne({ reference: req.params.reference, user: req.user.id });
  if (!p) return res.status(404).json({ error: "Payment not found" });
  res.json({ status: p.status, amount: p.amount, receipt: p.receipt });
});
/* MegaPay webhook — receives via:
   (a) your Cloudflare relay worker -> POST /api/megapay/webhook  (header X-Relay-Key)
   (b) direct callback              -> POST /api/payments/callback (?key= secret)
   Handles both Daraja-style (ResultCode) and MegaPay-style (ResponseCode) payloads. */
async function megapayWebhookHandler(req, res) {
  const relayOk = req.headers["x-relay-key"] && req.headers["x-relay-key"] === (process.env.RELAY_SECRET || process.env.MEGAPAY_CALLBACK_SECRET);
  const directOk = req.query.key && req.query.key === process.env.MEGAPAY_CALLBACK_SECRET;
  if (!relayOk && !directOk) return res.status(401).json({ error: "Unauthorized" });

  const b = req.body || {};
  const success = String(b.ResultCode ?? b.ResponseCode ?? "1") === "0";
  const amount = Number(b.TransactionAmount ?? b.Amount ?? 0);
  const receipt = b.TransactionReceipt || b.Receipt || b.TransactionID || null;
  const reason = b.ResultDesc || b.ResponseDescription || "Payment not completed";

  // locate payment: our internal reference first, then MegaPay CheckoutRequestID
  let payment = null;
  if (b.TransactionReference) payment = await Payment.findOne({ reference: b.TransactionReference });
  if (!payment && b.CheckoutRequestID) payment = await Payment.findOne({ checkoutRequestId: b.CheckoutRequestID });
  if (!payment) return res.status(404).json({ error: "Unknown payment reference" });
  if (payment.status === "completed") return res.json({ ok: true, duplicated: true }); // idempotent

  if (success && amount >= payment.amount) {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await Payment.findOneAndUpdate({ _id: payment._id }, { status: "completed", receipt }, { session });
      await User.findByIdAndUpdate(payment.user, { $inc: { walletBalance: payment.amount } }, { session });
      await Transaction.create([{ user: payment.user, type: "topup", amount: payment.amount, reference: receipt || payment.reference }], { session });
      console.log(`Top-up credited: ${payment.reference} -> KES ${payment.amount} (${receipt || "no receipt"})`);
    });
  } else {
    await Payment.findOneAndUpdate({ _id: payment._id }, { status: "failed", failureReason: reason });
  }
  res.json({ ok: true });
}
app.post("/api/megapay/webhook", megapayWebhookHandler);
app.post("/api/payments/callback", megapayWebhookHandler);

/* ------------------------------- ADMIN ------------------------------ */
app.get("/api/admin/stats", auth, adminOnly, async (req, res) => {
  const [users, pendingSids, revenueAgg, messages24h] = await Promise.all([
    User.countDocuments({ role: "user" }),
    SenderId.countDocuments({ status: "pending" }),
    Transaction.aggregate([{ $match: { type: "topup" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    MessageLog.countDocuments({ createdAt: { $gte: new Date(Date.now() - 864e5) } }),
  ]);
  res.json({ users, pendingSenderIds: pendingSids, totalTopups: revenueAgg[0]?.total || 0, messages24h });
});
app.get("/api/admin/users", auth, adminOnly, async (req, res) => {
  res.json(await User.find().select("name email role walletBalance createdAt").sort({ createdAt: -1 }).limit(300));
});
// Create a user or admin directly
app.post("/api/admin/users", auth, adminOnly, async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: "name, email and password (min 6 chars) required" });
  if (!["user", "admin"].includes(role || "user")) return res.status(400).json({ error: "Invalid role" });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: "Email already registered" });
  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), role: role || "user" });
  res.status(201).json({ ok: true, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
});
// Change a user's role (promote/demote admin)
app.patch("/api/admin/users/:id/role", auth, adminOnly, async (req, res) => {
  const { role } = req.body || {};
  if (!["user", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
  if (String(req.params.id) === String(req.user.id) && role !== "admin")
    return res.status(400).json({ error: "You cannot demote yourself" });
  const u = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("name email role");
  if (!u) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true, user: u });
});
app.get("/api/admin/payments", auth, adminOnly, async (req, res) => {
  res.json(await Payment.find().populate("user", "name email").sort({ createdAt: -1 }).limit(200));
});
app.post("/api/admin/wallet/credit", auth, adminOnly, async (req, res) => {
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
app.get("/api/admin/onfon-balance", auth, adminOnly, async (req, res) => {
  try { res.json(await onfonBalance()); } catch (e) { res.status(502).json({ error: e.message }); }
});
app.post("/api/admin/dlr", async (req, res) => {
  const { MessageId, Status } = req.body || {};
  if (MessageId) await MessageLog.updateMany({ "onfonResponse.Data.MessageId": MessageId }, { dlrStatus: Status });
  res.json({ ok: true });
});
// sender ID admin
app.get("/api/senderids/admin/pending", auth, adminOnly, async (req, res) => {
  res.json(await SenderId.find({ status: "pending" }).populate("user", "name email"));
});
app.get("/api/senderids/admin/all", auth, adminOnly, async (req, res) => {
  res.json(await SenderId.find().populate("user", "name email").sort({ createdAt: -1 }).limit(200));
});
app.get("/api/senderids/admin/document/:sidId/:index", auth, adminOnly, async (req, res) => {
  const sid = await SenderId.findById(req.params.sidId);
  const doc = sid?.documents?.[Number(req.params.index)];
  if (!doc || !fs.existsSync(doc.path)) return res.status(404).json({ error: "Document not found" });
  res.download(doc.path, doc.originalName);
});
app.post("/api/senderids/admin/:id/approve", auth, adminOnly, async (req, res) => {
  const sid = await SenderId.findByIdAndUpdate(req.params.id, { status: "approved" }, { new: true });
  if (!sid) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true, senderId: sid });
});
app.post("/api/senderids/admin/:id/submitted", auth, adminOnly, async (req, res) => {
  const sid = await SenderId.findByIdAndUpdate(req.params.id, { status: "submitted" }, { new: true });
  if (!sid) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});
app.post("/api/senderids/admin/:id/reject", auth, adminOnly, async (req, res) => {
  const sid = await SenderId.findByIdAndUpdate(req.params.id, { status: "rejected" }, { new: true });
  if (!sid) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

mongoose.connection.on("connected", () => console.log("MongoDB connected"));
mongoose.connection.on("error", (e) => console.error("MongoDB error:", e));
mongoose.connect(process.env.MONGO_URI).then(() =>
  app.listen(PORT, () => console.log(`PhilCasting API (v6 single-file) on port ${PORT}`))
);
