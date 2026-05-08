const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    gameId: {
      type: String,
      default: "",
      trim: true,
    },
    highestRank: {
      type: String,
      required: true,
    },
    // --- حقول النشاط ---
    isOnline: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    // --- حقول اللعب ---
    primaryLane: {
      type: String,
      required: true,
    },
    secondaryLane: {
      type: String,
      required: true,
    },
    // --- 🔥 حقول النقاط (مهمة جداً للكنترولر) ---
    trainingPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    qualificationPoints: {
      // الحقل اللي كان ناقص
      type: Number,
      default: 0,
      min: 0,
    },
    // --- الرتب والسكواد ---
    role: {
      type: String,
      enum: ["Member", "Leader", "Co-Leader"],
      default: "Member",
    },
    isLeader: {
      type: Boolean,
      default: false,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
      index: true,
    },
    teamName: {
      type: String,
      default: "Solo Player",
      trim: true,
    },
    isBot: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// Middleware لتحديث حالة القائد تلقائياً قبل الحفظ
UserSchema.pre("save", function (next) {
  this.isLeader = ["Leader", "Co-Leader"].includes(this.role);
  next();
});

module.exports = mongoose.model("User", UserSchema);
