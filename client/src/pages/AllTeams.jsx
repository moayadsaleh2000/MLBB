import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowRight, FaDumbbell, FaTrophy } from "react-icons/fa";
import { GiShield } from "react-icons/gi";
import axios from "axios";
import "./AllTeams.css";

const AllTeams = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) {
        navigate("/login");
        return;
      }

      try {
        setLoading(true);
        // جلب الملف الشخصي وبيانات السكواد للتحقق من الصلاحيات
        const [profileRes, teamDataRes] = await Promise.all([
          axios.get("http://localhost:5000/api/auth/profile", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get("http://localhost:5000/api/auth/my-team", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const user = profileRes.data;
        const squad = teamDataRes.data;

        const userId = String(user._id);
        const squadLeaderId = squad?.leader
          ? String(squad.leader._id || squad.leader)
          : null;
        const coLeaderIds =
          squad?.coLeaders?.map((cl) => String(cl._id || cl)) || [];

        // تحديد ما إذا كان المستخدم يمتلك صلاحية بدء البطولة
        const hasAccess =
          user.role === "Leader" ||
          user.role === "Co-Leader" ||
          user.isLeader === true ||
          userId === squadLeaderId ||
          coLeaderIds.includes(userId);

        setIsAuthorized(hasAccess);

        if (squad?.members) {
          // جلب توزيع الفرق المتوازن بناءً على أعضاء السكواد
          const res = await axios.post(
            "http://localhost:5000/api/auth/matchmaking/balance",
            { members: squad.members },
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.data.success) {
            setTeams(res.data.teams || []);
          }
        }
      } catch (err) {
        console.error("Fetch Error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [token, navigate]);

  const handleStartTournament = async (mode) => {
    try {
      // تجهيز البيانات لإرسالها للسيرفر بـ IDs نظيفة
      const preparedTeams = teams.map((team, index) => {
        const teamId =
          team._id || (team.players && team.players[0]?._id) || `temp-${index}`;

        return {
          _id: String(teamId),
          name: team.name || `فريق ${index + 1}`,
          players: team.players.map((p) => ({
            _id: p._id || p.id || (p.user ? p.user._id || p.user.id : null),
            username: p.username,
            assignedLane: p.assignedLane,
          })),
        };
      });

      console.log("🚀 إرسال البيانات للبطولة:", { mode, teams: preparedTeams });

      // إنشاء البطولة في السيرفر
      const res = await axios.post(
        "http://localhost:5000/api/tournament/create",
        { mode, teams: preparedTeams },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // التعديل الجوهري: التوجيه باستخدام الـ ID في الرابط (Dynamic Routing)
      // هذا يضمن توافق الرابط مع إعدادات App.js الجديدة
      if (res.data && res.data._id) {
        navigate(`/match-schedule/${res.data._id}`, { state: res.data });
      } else {
        alert("فشل السيرفر في إعادة معرف البطولة (ID)");
      }
    } catch (err) {
      console.error(
        "Tournament Start Error:",
        err.response?.data || err.message,
      );
      alert(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "حدث خطأ أثناء بدء البطولة.",
      );
    }
  };

  if (loading) return <div className="loader">⚔️ جاري تحضير الفرق...</div>;

  return (
    <div className="roster-page-wrapper">
      <header className="roster-header">
        <button className="back-btn" onClick={() => navigate("/squad")}>
          <FaArrowRight />
        </button>
        <h1>توزيع المجموعات ({teams.length})</h1>
        <div style={{ width: "40px" }}></div>
      </header>

      <div className="roster-container">
        {teams.length === 0 ? (
          <p className="empty-msg">لا توجد فرق جاهزة حالياً</p>
        ) : (
          teams.map((team, index) => (
            <div
              key={team._id || `team-card-${index}`}
              className="team-roster-card"
            >
              <div className="team-header-info">
                <GiShield className="team-icon" />
                <h2>فريق {index + 1}</h2>
              </div>
              <div className="players-list">
                {team.players.map((p, pIdx) => (
                  <div key={p._id || `p-${pIdx}`} className="player-row">
                    <span className="p-name">{p.username}</span>
                    <span className="p-lane">{p.assignedLane}</span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {isAuthorized && teams.length > 0 && (
        <div className="admin-actions-bar">
          <button
            className="action-btn training"
            onClick={() => handleStartTournament("training")}
          >
            <FaDumbbell /> بدء تدريب
          </button>
          <button
            className="action-btn qualify"
            onClick={() => handleStartTournament("qualification")}
          >
            <FaTrophy /> بدء تأهيل
          </button>
        </div>
      )}
    </div>
  );
};

export default AllTeams;
