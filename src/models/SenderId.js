const mongoose = require("mongoose");

const senderIdSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  value: { type: String, required: true, unique: true, uppercase: true, maxlength: 11 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
}, { timestamps: true });

module.exports = mongoose.model("SenderId", senderIdSchema);
