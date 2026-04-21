const express = require("express");
const cors = require("cors");
const { connectDB, Player, Settings } = require("./db");
const routes = require("./routes");
require("dotenv").config();

const app = express();

// إعدادات CORS محسنة للسماح للفرونت إند بكل الصلاحيات المطلوبة
app.use(
  cors({
    origin: "*", // يسمح لأي موقع (بما فيهم نيتليفاي) بالوصول
    methods: ["GET", "POST", "PUT", "DELETE"], // السماح بكل أنواع العمليات
    allowedHeaders: ["Content-Type", "Authorization"], // مهم جداً عشان التوكين يمر بسلام
  }),
);

app.use(express.json());

// توصيل قاعدة البيانات
connectDB();

// تمرير الموديلات للراوتس
app.use("/api", routes({ Player, Settings }));

// إضافة مسار فحص بسيط للتأكد من عمل السيرفر
app.get("/", (req, res) => {
  res.send("MLBB Server is Running... 🚀");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT} 🚀`);
});
