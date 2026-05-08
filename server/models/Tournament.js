const mongoose = require("mongoose");

const tournamentSchema = new mongoose.Schema(
  {
    // معرف السكواد (اختياري إذا كانت البطولة عامة، وإجباري إذا كانت داخلية)
    squadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: false,
    },
    // نوع البطولة: تدريب أو تصفيات (تأهيل)
    mode: {
      type: String,
      // تم تعديل القائمة لتشمل "qualification" لتطابق الكود في الـ Controller
      enum: ["training", "qualifying", "qualification"],
      default: "training",
    },
    // نظام البطولة: خروج مغلوب (bracket) أو دوري (league)
    systemType: {
      type: String,
      enum: ["bracket", "league"],
      required: true,
    },
    // حالة البطولة
    status: {
      type: String,
      enum: ["active", "finished"],
      default: "active",
    },
    // مصفوفة الفرق المشاركة
    teams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
      },
    ],
    // نظام خروج المغلوب (Bracket)
    rounds: [
      {
        roundNumber: { type: Number },
        matches: [
          {
            teamA: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
            teamB: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
            winner: { type: String, default: null }, // يخزن ID الفريق الفائز كـ string
          },
        ],
      },
    ],
    // نظام الدوري (League)
    leagueMatches: [
      {
        teamA: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
        teamB: { type: mongoose.Schema.Types.ObjectId, ref: "Team" },
        winner: { type: String, default: null },
      },
    ],
    // جدول نقاط الدوري (ID الفريق مقابل عدد النقاط)
    leaguePoints: {
      type: Map,
      of: Number,
      default: {},
    },
    // الفائز النهائي بالبطولة
    finalWinner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },
  },
  {
    timestamps: true, // يضيف تاريخ الإنشاء والتحديث تلقائياً
  },
);

// تصدير الموديل مع التحقق من عدم تكرار تعريفه
module.exports =
  mongoose.models.Tournament || mongoose.model("Tournament", tournamentSchema);
