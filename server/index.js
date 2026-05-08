const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const connectDB = require("./config/db");

// 1. استدعاء dotenv بشكل بسيط للـ Production
require("dotenv").config();

const authRoutes = require("./routes/userRoutes");

const app = express();
const server = http.createServer(app);

// 2. إعداد Socket.io
// ملاحظة: الـ origin يفضل تعديله لاحقاً لرابط الـ Vercel للأمان
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

global.io = io;

// الاتصال بقاعدة البيانات
connectDB();

// 3. الميدل وير
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use(express.json());

// 4. المسارات (Routes)
app.use("/api/auth", authRoutes);
app.use("/api/tournament", authRoutes);

// 5. منطق السوكيت
io.on("connection", (socket) => {
  console.log("🔌 متصل جديد:", socket.id);

  socket.on("joinTournament", (tournamentId) => {
    if (tournamentId) {
      socket.join(tournamentId);
      console.log(`👤 انضم للغرفة: ${tournamentId}`);
    }
  });

  socket.on("disconnect", (reason) => {
    console.log(`❌ غادر الاتصال. السبب: ${reason}`);
  });
});

// رسالة ترحيب عند الدخول على رابط السيرفر مباشرة
app.get("/", (req, res) => {
  res.send("MLBB Tournament Server is Running! 🚀");
});

// 6. تشغيل السيرفر على البورت الديناميكي (مهم جداً لـ Railway)
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
