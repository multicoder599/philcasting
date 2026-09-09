const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

function sign(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

router.post("/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: "name, email and password (min 6 chars) required" });
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) return res.status(409).json({ error: "Email already registered" });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash });
  res.status(201).json({ token: sign(user), user: { id: user._id, name, email, role: user.role } });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: (email || "").toLowerCase() });
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash)))
    return res.status(401).json({ error: "Invalid credentials" });
  res.json({
    token: sign(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role, walletBalance: user.walletBalance },
  });
});

module.exports = router;
