const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  reference: { type: String, required: true, unique: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  phone: { type: String, required: true },
  status: { type: String, enum: ["pending", "completed", "failed"], default: "pending", index: true },
  receipt: { type: String, default: null },        // M-Pesa receipt from webhook
  checkoutRequestId: { type: String, default: null },
  failureReason: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model("Payment", paymentSchema);
