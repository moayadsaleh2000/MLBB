const mongoose = require("mongoose");

const TeamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    leader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    coLeaders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    requests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // هل الفريق مؤقت (تم إنشاؤه لبطولة معينة)؟
    isTemporary: {
      type: Boolean,
      default: false,
    },
    // --- الحقول الجديدة لحفظ فرق النخبة ---
    eliteTeams: {
      type: Array,
      default: [],
    },
    balancedTeamsGeneratedAt: {
      type: Date,
      default: null,
    },
    activeTournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      default: null,
    },
    activeTournamentMode: {
      type: String,
      enum: ["training", "qualification", "qualifying", null],
      default: null,
    },
    lastQualifyingDate: {
      type: Date,
      default: null,
    },
    announcement: {
      type: String,
      default: "Welcome to our squad! Keep an eye here for mission updates.",
      trim: true,
    },
    matchesPlayed: {
      type: Number,
      default: 0,
      min: 0,
    },
    points: {
      type: Number,
      default: 0,
    },
    maxMembers: {
      type: Number,
      default: 9999,
    },
  },
  { timestamps: true },
);

// Middleware محسن: يحافظ على تكامل البيانات ويمنع التكرار
// تم حذف 'next' لأننا نستخدم async/await والمونغوز يدعم ذلك تلقائياً
TeamSchema.pre("save", async function () {
  try {
    // تحويل الـ Leader ID لنص للمقارنة السهلة
    const leaderStr = this.leader ? this.leader.toString() : null;
    let membersStr = this.members.map((m) => m.toString());

    // 1. ضمان وجود القائد في المصفوفة
    if (leaderStr && !membersStr.includes(leaderStr)) {
      this.members.push(this.leader);
      membersStr.push(leaderStr); // تحديث القائمة المحلية للمقارنة التالية
    }

    // 2. ضمان وجود المساعدين في المصفوفة
    if (this.coLeaders && this.coLeaders.length > 0) {
      this.coLeaders.forEach((coId) => {
        const coIdStr = coId.toString();
        if (!membersStr.includes(coIdStr)) {
          this.members.push(coId);
          membersStr.push(coIdStr);
        }
      });
    }

    // 3. إزالة التكرار النهائي وضمان نوع البيانات ObjectId
    if (this.members && this.members.length > 0) {
      const uniqueMembers = [
        ...new Set(this.members.map((id) => id.toString())),
      ];
      this.members = uniqueMembers.map((id) => new mongoose.Types.ObjectId(id));
    }

    if (this.coLeaders && this.coLeaders.length > 0) {
      const uniqueCoLeaders = [
        ...new Set(this.coLeaders.map((id) => id.toString())),
      ];
      this.coLeaders = uniqueCoLeaders.map(
        (id) => new mongoose.Types.ObjectId(id),
      );
    }

    // في async middleware، لا نحتاج لـ next()
  } catch (error) {
    // رمي الخطأ يخبر المونغوز بفشل عملية الحفظ
    throw error;
  }
});

module.exports = mongoose.model("Team", TeamSchema);
