const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: ["topup", "debit", "refund"], required: true },
  amount: { type: Number, required: true, min: 0 },
  reference: { type: String, default: null }, // Onfon message id, M-Pesa ref, etc.
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);
