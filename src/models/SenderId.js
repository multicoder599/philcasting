const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  field: { type: String, enum: ["certificate", "permit", "idCopy"] },
  originalName: String,
  path: String,
}, { _id: false });

const senderIdSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  value: { type: String, required: true, unique: true, uppercase: true, maxlength: 11 },
  status: { type: String, enum: ["pending", "submitted", "approved", "rejected"], default: "pending", index: true },
  // OnfonMedia application fields
  businessName: { type: String, trim: true, default: "" },
  purpose: { type: String, trim: true, default: "" },
  contactPhone: { type: String, trim: true, default: "" },
  documents: { type: [documentSchema], default: [] },
  onfonStatus: { type: String, default: null }, // mirror of portal status if you track it
}, { timestamps: true });

module.exports = mongoose.model("SenderId", senderIdSchema);
