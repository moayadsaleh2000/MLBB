const mongoose = require("mongoose");

const AnnouncementSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true, // مهم جداً لتسريع جلب إعلانات فريق معين
    },
    // تم تغيير التسمية لتشمل أي شخص من الإدارة (Leader or Co-Leader)
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    // تحديد نوع الإعلان (اختياري)
    type: {
      type: String,
      enum: ["General", "Match", "Urgent"],
      default: "General",
    },
  },
  { timestamps: true },
);

// إنشاء الـ TTL Index للحذف التلقائي بعد 3 أيام (259200 ثانية)
AnnouncementSchema.index({ createdAt: 1 }, { expireAfterSeconds: 259200 });

module.exports = mongoose.model("Announcement", AnnouncementSchema);
