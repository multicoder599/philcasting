require("dotenv").config();
const express = require("express");
const connectDB = require("./src/config/db");

const app = express();
// add right after: const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://philcasting.newtonmulti.workers.dev");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
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
