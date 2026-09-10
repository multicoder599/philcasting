require("dotenv").config();
const express = require("express");
const connectDB = require("./src/config/db");

const app = express();
const allowedOrigins = [
  "https://philcasting.com",
  "https://philcasting.newtonmulti.workers.dev",
  "http://localhost:3000" // Optional: for local development
];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: "2mb" }));

app.use("/api/auth", require("./src/routes/auth.routes"));
app.use("/api/wallet", require("./src/routes/wallet.routes"));
app.use("/api/senderids", require("./src/routes/senderid.routes"));
app.use("/api/sms", require("./src/routes/sms.routes"));
app.use("/api/admin", require("./src/routes/admin.routes"));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// 404 + error handler
app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

const PORT = process.env.PORT || 4000;
connectDB().then(() =>
  app.listen(PORT, () => console.log(`PhilCasting API on port ${PORT}`))
);
