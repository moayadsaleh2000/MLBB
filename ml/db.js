const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`تم الاتصال بـ MongoDB: ${conn.connection.host} ✅`);
    await seedSettings();
  } catch (error) {
    console.error(`خطأ: ${error.message}`);
    process.exit(1);
  }
};

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  rank: String,
  primaryRole: String,
  secondaryRole: String,
  createdAt: { type: Date, default: Date.now },
});

const settingsSchema = new mongoose.Schema({
  required_players: { type: Number, default: 0 },
  reveal_started: { type: Boolean, default: false },
  // الحقل الجديد هون ضروري جداً لميزة قفل التسجيل
  registration_open: { type: Boolean, default: true },
});

const Player = mongoose.model("Player", playerSchema);
const Settings = mongoose.model("Settings", settingsSchema);

async function seedSettings() {
  const count = await Settings.countDocuments();
  if (count === 0) {
    // ضفنا الحالة الافتراضية (مفتوح) عند تشغيل البرنامج لأول مرة
    await Settings.create({
      required_players: 0,
      reveal_started: false,
      registration_open: true,
    });
  }
}

module.exports = { connectDB, Player, Settings };
