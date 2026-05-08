import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import "./Login.css";

const Login = () => {
  const navigate = useNavigate();
  const [clickCount, setClickCount] = useState(0);
  const [isLeader, setIsLeader] = useState(false);
  const [loading, setLoading] = useState(false); // حالة التحميل

  const [formData, setFormData] = useState({
    username: "",
    highestRank: "",
    primaryLane: "",
    secondaryLane: "",
    teamName: "Solo Player",
  });

  const ranks = [
    "Epic",
    "Legend",
    "Mythic (0-25 Stars)",
    "Mythic Honor (25-50)",
    "Mythic Glory (50-100)",
    "Mythic Immortal (100+)",
  ];
  const lanes = ["Gold Lane", "EXP Lane", "Mid Lane", "Jungler", "Roamer"];

  // حركة الـ 5 كبسات السرية على العنوان
  const handleTitleClick = () => {
    setClickCount((prev) => prev + 1);
    if (clickCount + 1 === 5) {
      setClickCount(0);
      Swal.fire({
        title: "كود القائد السري",
        input: "password",
        inputPlaceholder: "أدخل رمز الوصول",
        background: "#0f172a",
        color: "#00f2ff",
        confirmButtonText: "تحقق",
        confirmButtonColor: "#00f2ff",
      }).then((result) => {
        if (result.value === "153968") {
          setIsLeader(true);
          Swal.fire({
            icon: "success",
            title: "أهلاً أيها القائد!",
            text: "يمكنك الآن إدخال اسم السكواد الخاص بك",
            background: "#0f172a",
            color: "#fff",
          });
        } else if (result.value) {
          Swal.fire("خطأ!", "الرمز الذي أدخلته غير صحيح", "error");
        }
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // 1. فحص الاسم: أحرف فقط ومسافات
    const nameRegex = /^[a-zA-Z\s\u0600-\u06FF]+$/;
    const cleanUsername = formData.username.trim();

    if (!nameRegex.test(cleanUsername) || cleanUsername.length < 3) {
      return Swal.fire(
        "خطأ بالاسم",
        "الاسم يجب أن يحتوي على أحرف فقط ولا يقل عن 3 حروف",
        "error",
      );
    }

    // 2. فحص اللين: ممنوع التكرار
    if (formData.primaryLane === formData.secondaryLane) {
      return Swal.fire("خطأ باللين", "يرجى اختيار مسارين مختلفين", "warning");
    }

    setLoading(true); // بدء التحميل
    try {
      // إرسال البيانات للباك إند
      const res = await axios.post("http://localhost:5000/api/auth/login", {
        ...formData,
        username: cleanUsername,
        isLeader: isLeader,
      });

      // تخزين البيانات
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      Swal.fire({
        title: "تم التسجيل بنجاح!",
        text: `مرحباً بك في البطولة يا ${res.data.user.username}`,
        icon: "success",
        timer: 1500,
        showConfirmButton: false,
        background: "#0f172a",
        color: "#fff",
      });

      // ✅ التعديل هنا: استخدام window.location.href بدلاً من navigate
      // لضمان إعادة تشغيل App.js وقراءة التوكن الجديد فوراً
      setTimeout(() => {
        window.location.href = "/home";
      }, 1600);
    } catch (err) {
      Swal.fire(
        "فشل الدخول",
        err.response?.data?.message || "مشكلة في الاتصال بالسيرفر",
        "error",
      );
    } finally {
      setLoading(false); // إنهاء التحميل
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <h2
          onClick={handleTitleClick}
          className={isLeader ? "gold-text" : "cyan-text"}
          style={{ cursor: "pointer", userSelect: "none", transition: "0.3s" }}
        >
          {isLeader ? "SQUAD LEADER ACCESS" : "MLBB TOURNAMENT LOGIN"}
        </h2>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Player Name</label>
            <input
              type="text"
              placeholder="Your In-Game Name"
              value={formData.username}
              onChange={(e) =>
                setFormData({ ...formData, username: e.target.value })
              }
              disabled={loading}
              required
            />
          </div>

          <div className="input-row">
            <div className="input-group">
              <label>Highest Rank</label>
              <select
                value={formData.highestRank}
                onChange={(e) =>
                  setFormData({ ...formData, highestRank: e.target.value })
                }
                disabled={loading}
                required
              >
                <option value="">Select Rank</option>
                {ranks.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="input-row" style={{ display: "flex", gap: "10px" }}>
            <div className="input-group" style={{ flex: 1 }}>
              <label>Primary Lane</label>
              <select
                value={formData.primaryLane}
                onChange={(e) =>
                  setFormData({ ...formData, primaryLane: e.target.value })
                }
                disabled={loading}
                required
              >
                <option value="">Primary</option>
                {lanes.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-group" style={{ flex: 1 }}>
              <label>Secondary Lane</label>
              <select
                value={formData.secondaryLane}
                onChange={(e) =>
                  setFormData({ ...formData, secondaryLane: e.target.value })
                }
                disabled={loading}
                required
              >
                <option value="">Secondary</option>
                {lanes.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isLeader && (
            <div className="input-group leader-field animation-fade-in">
              <label>Squad Name</label>
              <input
                type="text"
                placeholder="Enter Squad Name"
                onChange={(e) =>
                  setFormData({ ...formData, teamName: e.target.value })
                }
                disabled={loading}
                required
              />
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "AUTHENTICATING..." : "ENTER ARENA"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
