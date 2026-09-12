const mongoose = require("mongoose");

const AlertLogSchema = new mongoose.Schema({
  region: { type: String, required: true },
  riskPercent: { type: Number },
  channels: [{ type: String }],
  source: { type: String, default: "Civil Authority" },
  isCitizenSOS: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("AlertLog", AlertLogSchema);