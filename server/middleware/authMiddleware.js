const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
  let token;

  // 1. التحقق من وجود التوكن في الهيدر
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // استخراج التوكن
      token = req.headers.authorization.split(" ")[1];

      // 2. التحقق من صحة التوكن
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 3. جلب بيانات المستخدم وتخزينها في req.user
      // اخترنا الحقول المهمة فقط لتقليل الضغط
      req.user = await User.findById(decoded.id).select("-password");

      // 4. التأكد من أن المستخدم لا يزال موجوداً في قاعدة البيانات
      if (!req.user) {
        return res
          .status(401)
          .json({ message: "المستخدم المرتبط بهذا التوكن لم يعد موجوداً" });
      }

      return next(); // "تفضل ادخل"
    } catch (error) {
      console.error(`JWT Error: ${error.message}`);
      return res
        .status(401)
        .json({ message: "جلسة العمل انتهت أو التوكن غير صالح" });
    }
  }

  // 5. إذا لم يتم العثور على توكن نهائياً
  if (!token) {
    return res
      .status(401)
      .json({ message: "غير مصرح لك، يرجى تسجيل الدخول أولاً" });
  }
};

module.exports = { protect };
