const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  }, // القائد
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // الشخص اللي بدو ينضم
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
  type: { type: String, enum: ["JOIN_REQUEST"], default: "JOIN_REQUEST" },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now, expires: "7d" }, // تنتهي بعد أسبوع
});

module.exports = mongoose.model("Notification", NotificationSchema);
