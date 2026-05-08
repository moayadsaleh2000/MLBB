const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/db");

const authRoutes = require("./routes/userRoutes");

const app = express();
const server = http.createServer(app);

// 1. إعداد Socket.io مع حماية من الفصل
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
connectDB();

// 2. الميدل وير
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use(express.json());

// 3. المسارات - تأكد من توحيدها لتجنب الـ 404
app.use("/api/auth", authRoutes);
app.use("/api/tournament", authRoutes);

// 4. منطق السوكيت المطور
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

app.get("/", (req, res) => {
  res.send("Server is alive with Socket.io! 🚀");
});

// 5. تقديم ملفات الواجهة + fallback للـ SPA (حل مشكلة refresh على الموبايل)
const clientDistPath = path.resolve(__dirname, "../client/dist");
app.use(express.static(clientDistPath));

app.get(/^\/(?!api|socket\.io).*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
