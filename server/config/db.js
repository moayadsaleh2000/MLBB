const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      console.error("❌ Error: MONGO_URI is not defined in .env file");
      process.exit(1);
    }

    // إعداد اختياري لـ Mongoose 7+ لمنع التحذيرات في الـ Console
    mongoose.set("strictQuery", false);

    const conn = await mongoose.connect(uri);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Connection Failed: ${error.message}`);
    process.exit(1);
  }
};

// التعامل مع انقطاع الاتصال المفاجئ
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected. Attempting to reconnect...");
});

module.exports = connectDB;
