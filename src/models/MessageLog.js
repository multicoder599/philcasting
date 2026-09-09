const mongoose = require("mongoose");

const messageLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  senderId: { type: String, required: true },
  recipients: [{ type: String }],
  text: { type: String, required: true },
  cost: { type: Number, required: true },
  status: { type: String, enum: ["sent", "failed"], required: true },
  onfonResponse: { type: mongoose.Schema.Types.Mixed },
  dlrStatus: { type: String, default: null }, // updated by DLR webhook
}, { timestamps: true });

module.exports = mongoose.model("MessageLog", messageLogSchema);
