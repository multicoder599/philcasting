const express = require("express");
const { auth } = require("../middleware/auth");
const User = require("../models/User");
const Transaction = require("../models/Transaction");

const router = express.Router();
router.use(auth);

router.get("/balance", async (req, res) => {
  const user = await User.findById(req.user.id).select("walletBalance");
  res.json({ walletBalance: user.walletBalance });
});

router.get("/transactions", async (req, res) => {
  const txns = await Transaction.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(100);
  res.json(txns);
});

module.exports = router;
