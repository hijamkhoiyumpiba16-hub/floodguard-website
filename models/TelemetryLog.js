const mongoose = require("mongoose");

const TelemetryLogSchema = new mongoose.Schema({
  location: { type: String, required: true },
  latitude: Number,
  longitude: Number,
  rainRate: Number,
  riverCrest: Number,
  riskPercent: Number,
  recordedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("TelemetryLog", TelemetryLogSchema);