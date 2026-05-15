import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaCamera,
  FaBell,
  FaShieldAlt,
  FaUserCircle,
  FaGamepad,
  FaMedal,
  FaTrophy,
  FaUsers,
  FaListUl,
  FaTrashAlt,
} from "react-icons/fa";
import axios from "axios";
import Swal from "sweetalert2";
import { io } from "socket.io-client";
import "./Home.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const Home = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [displayTeams, setDisplayTeams] = useState([]);
  const [myFullTeam, setMyFullTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasNewNotif, setHasNewNotif] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [isInQueue, setIsInQueue] = useState(false);
  const [activeTournament, setActiveTournament] = useState(null);
  const [showAllMembers, setShowAllMembers] = useState(false);

  const token = localStorage.getItem("token");

  // --- دالة جلب البيانات الأساسية (تحديث صامت في الخلفية) ---
  const fetchDashboardData = useCallback(async () => {
    try {
      if (!token) {
        navigate("/");
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };

      // 1. بيانات البروفايل
      const resUser = await axios.get(`${API_URL}/api/tournament/profile`, {
        headers,
      });
      const currentUser = resUser.data;
      setUser(currentUser);

      // 2. بيانات السكوادات الرسمية
      const resTeams = await axios.get(`${API_URL}/api/tournament/teams`, {
        headers,
      });
      const officialSquads = resTeams.data.filter(
        (team) => team.isTemporary === false,
      );
      setDisplayTeams(officialSquads.slice(0, 4));

      // 3. بيانات السكواد الخاص بي
      const resMyTeam = await axios.get(`${API_URL}/api/tournament/my-team`, {
        headers,
      });
      const teamData = resMyTeam.data;

      if (teamData) {
        setMyFullTeam(teamData);
        const currentUserId = currentUser._id || currentUser.id;
        const leaderId = teamData.leader?._id || teamData.leader;

        // تفقد الإشعارات للقادة فقط
        if (currentUserId === leaderId) {
          const reqRes = await axios
            .get(`${API_URL}/api/tournament/team/requests`, { headers })
            .catch(() => ({ data: [] }));
          if (reqRes.data && reqRes.data.length > 0) setHasNewNotif(true);
        }

        if (teamData.announcement) setHasNewNotif(true);

        // تفقد حالة الانتظار والتصفيات
        const resQueue = await axios.get(
          `${API_URL}/api/tournament/qualifying/queue`,
          { headers },
        );
        setQueueCount(resQueue.data.queueCount);
        setIsInQueue(
          (resQueue.data.teams || []).some((t) => t._id === teamData._id),
        );

        const resActive = await axios.get(
          `${API_URL}/api/tournament/qualifying/active`,
          { headers },
        );
        setActiveTournament(resActive.data);
      }
    } catch (err) {
      console.error("Dashboard Sync Error:", err);
      if (err.response?.status === 401) {
        localStorage.clear();
        navigate("/");
      }
    } finally {
      setLoading(false); // يتم الإغلاق فقط بعد أول جلب
    }
  }, [token, navigate]);

  // --- تصفير النقاط ---
  const handleResetPoints = async () => {
    const result = await Swal.fire({
      title: "تصفير نقاط السكواد؟",
      text: "سيتم إعادة نقاط جميع الأعضاء إلى 0، هل أنت متأكد من هذه الخطوة؟",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "نعم، صفر الآن",
      cancelButtonText: "إلغاء",
      background: "#0a0e14",
      color: "#fff",
    });

    if (result.isConfirmed) {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        await axios.post(
          `${API_URL}/api/tournament/team/reset-members-points`,
          {},
          { headers },
        );
        Swal.fire({
          title: "تم التصفير!",
          text: "تم مسح نقاط جميع المحاربين بنجاح.",
          icon: "success",
          background: "#0a0e14",
          color: "#fff",
        });
        fetchDashboardData(); // تحديث فوري بعد التصفير
      } catch (err) {
        Swal.fire({
          title: "خطأ",
          text: err.response?.data?.error || "فشل تصفير النقاط",
          icon: "error",
          background: "#0a0e14",
          color: "#fff",
        });
      }
    }
  };

  // --- قبول ورفض الطلبات ---
  const handleAcceptRequest = useCallback(
    async (userId) => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        await axios.post(
          `${API_URL}/api/tournament/team/respond`,
          { userId, action: "accept" },
          { headers },
        );
        Swal.fire("تم القبول", "المحارب انضم لصفوفكم!", "success");
        fetchDashboardData();
      } catch (err) {
        Swal.fire("فشل", err.response?.data?.error || "حدث خطأ", "error");
      }
    },
    [token, fetchDashboardData],
  );

  const handleRejectRequest = useCallback(
    async (userId) => {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        await axios.post(
          `${API_URL}/api/tournament/team/respond`,
          { userId, action: "reject" },
          { headers },
        );
        Swal.fire("تم الرفض", "تم إبعاد المحارب", "info");
        fetchDashboardData();
      } catch (err) {
        Swal.fire("فشل", "حدث خطأ أثناء رفض الطلب", "error");
      }
    },
    [token, fetchDashboardData],
  );

  // ربط الدوال بالنافذة لـ Swal
  useEffect(() => {
    window.acceptReq = (id) => handleAcceptRequest(id);
    window.rejectReq = (id) => handleRejectRequest(id);
    return () => {
      delete window.acceptReq;
      delete window.rejectReq;
    };
  }, [handleAcceptRequest, handleRejectRequest]);

  // --- التحديث التلقائي والسوكيت ---
  useEffect(() => {
    // 1. الجلب الأول عند الدخول
    fetchDashboardData();

    // 2. إعداد الـ Socket للرسائل اللحظية جداً
    const socket = io(API_URL, { auth: { token } });
    socket.on("pointsUpdated", () => fetchDashboardData());
    socket.on("tournamentStarted", (newData) => {
      setActiveTournament(newData);
      Swal.fire({
        title: '<span style="color: #00d4ff;">بدأت الملحمة!</span>',
        text: "تم إنشاء جدول التصفيات، توجه لساحة المعركة الآن",
        icon: "info",
        background: "#0a0e14",
        color: "#fff",
      }).then(() => navigate("/matches"));
    });
    socket.on("qualifyingQueueUpdated", (data) => {
      setQueueCount(data.count);
      fetchDashboardData();
    });
    socket.on("newJoinRequest", () => setHasNewNotif(true));

    // 3. الـ Polling: تحديث تلقائي كل 10 ثوانٍ (لضمان المزامنة في حال فشل السوكيت)
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 10000);

    return () => {
      socket.disconnect();
      clearInterval(interval); // تنظيف التايمر عند مغادرة الصفحة
    };
  }, [fetchDashboardData, token, navigate]);

  // ترتيب الأعضاء حسب النقاط
  const visibleMembers = useMemo(() => {
    if (!myFullTeam || !myFullTeam.members) return [];
    const sorted = [...myFullTeam.members].sort(
      (a, b) => (b.trainingPoints || 0) - (a.trainingPoints || 0),
    );
    return showAllMembers ? sorted : sorted.slice(0, 10);
  }, [myFullTeam, showAllMembers]);

  // التعامل مع الإشعارات
  const handleBellClick = async () => {
    setHasNewNotif(false);
    const currentUserId = user?._id || user?.id;
    const isLeader =
      myFullTeam &&
      currentUserId === (myFullTeam.leader?._id || myFullTeam.leader);

    if (!isLeader) {
      Swal.fire({
        title: "الإشعارات",
        text: "لا توجد رسائل جديدة للقادة حالياً",
        icon: "info",
        background: "#0a0e14",
        color: "#fff",
      });
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API_URL}/api/tournament/team/requests`, {
        headers,
      });
      const requests = res.data;

      if (requests.length === 0) {
        Swal.fire({
          title: "لا توجد طلبات",
          text: "كل شيء هادئ في السكواد",
          icon: "success",
          background: "#0a0e14",
          color: "#fff",
        });
        return;
      }

      const requestsHtml = requests
        .map(
          (req) => `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #1a232e; padding: 12px; border-radius: 8px; border-left: 4px solid #d4af37;">
          <div style="text-align: left;">
            <div style="font-weight: bold; color: #fff;">${req.username || "Unknown Player"}</div>
            <div style="font-size: 0.8rem; color: #aaa;">Rank: ${req.highestRank || "N/A"}</div>
          </div>
          <div>
            <button onclick="window.acceptReq('${req._id}')" style="background: #d4af37; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; color: #000; font-weight: bold; margin-right: 5px;">قبول</button>
            <button onclick="window.rejectReq('${req._id}')" style="background: #d33; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; color: #fff;">رفض</button>
          </div>
        </div>`,
        )
        .join("");

      Swal.fire({
        title: '<span style="color: #d4af37;">طلبات الانضمام</span>',
        html: `<div style="max-height: 350px; overflow-y: auto;">${requestsHtml}</div>`,
        showConfirmButton: false,
        background: "#0a0e14",
        color: "#fff",
        showCloseButton: true,
      });
    } catch (err) {
      console.error("Notif Error:", err);
    }
  };

  const handleQualifyingClick = async () => {
    if (activeTournament || isInQueue) {
      navigate("/matches");
      return;
    }
    const currentUserId = user?._id || user?.id;
    const isLeader =
      myFullTeam &&
      currentUserId === (myFullTeam.leader?._id || myFullTeam.leader);
    const isCoLeader =
      myFullTeam &&
      myFullTeam.coLeaders?.some((cl) => (cl._id || cl) === currentUserId);

    if (!isLeader && !isCoLeader) {
      Swal.fire({
        title: "تنبيه",
        text: "يجب على قائد السكواد التسجيل أولاً",
        icon: "warning",
        background: "#0a0e14",
        color: "#fff",
      });
      return;
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      await axios.post(
        `${API_URL}/api/tournament/register-qualifying`,
        {},
        { headers },
      );
      setIsInQueue(true);
      navigate("/matches");
    } catch (err) {
      Swal.fire({
        title: "عذراً",
        text: err.response?.data?.error || "حدث خطأ",
        icon: "error",
        background: "#0a0e14",
        color: "#fff",
      });
    }
  };

  if (loading) return <div className="loader">LOADING BATTLEFIELD...</div>;
  if (!user) return null;

  const currentUserId = user._id || user.id;
  const isLeader =
    myFullTeam &&
    currentUserId === (myFullTeam.leader?._id || myFullTeam.leader);
  const isCoLeader =
    myFullTeam &&
    myFullTeam.coLeaders?.some((cl) => (cl._id || cl) === currentUserId);
  const canSeeTrophy =
    isLeader || isCoLeader || isInQueue || !!activeTournament;

  return (
    <div className="home-wrapper">
      <header className="main-header">
        <div className="header-left">
          <div
            className="action-item profile-crest"
            onClick={() => navigate("/profile")}
          >
            <FaUserCircle />
          </div>
          {canSeeTrophy && (
            <div
              className={`action-item qualifying-btn ${isInQueue ? "in-queue-active" : ""} ${activeTournament ? "tournament-live-glow" : ""}`}
              onClick={handleQualifyingClick}
            >
              <FaTrophy
                className={
                  activeTournament ? "blue-trophy-icon" : "gold-trophy-icon"
                }
              />
              {activeTournament ? (
                <span className="live-badge-tiny">LIVE</span>
              ) : (
                queueCount > 0 && (
                  <span className="queue-badge-count">{queueCount}</span>
                )
              )}
            </div>
          )}
          <div className="action-item" onClick={handleBellClick}>
            <FaBell />
            {hasNewNotif && <span className="red-notif-dot"></span>}
          </div>
          <div className="action-item" onClick={() => navigate("/squad")}>
            <FaShieldAlt />
          </div>
        </div>
        <div className="header-right">
          <div className="mlbb-logo-container">
            <FaGamepad className="mlbb-icon-main" />
            <div className="logo-text-box">
              <span className="brand-main">MOBILE LEGENDS</span>
              <span className="brand-sub">BATTLE ARENA</span>
            </div>
          </div>
        </div>
      </header>

      <section className="squads-container">
        <h2 className="section-label">TOP BATTLE SQUADS</h2>
        <div className="squads-grid-layout">
          {displayTeams.map((team) => {
            const isMyTeam = myFullTeam && team._id === myFullTeam._id;
            return (
              <div
                key={team._id}
                className={`squad-card ${isMyTeam ? "active-squad-glow" : ""}`}
              >
                <h3>{team.name}</h3>
                <div className="squad-stats-mini">
                  <span>
                    <FaUsers /> {team.members?.length || 0}
                  </span>
                  <div className="points-tag">{team.points || 0} PTS</div>
                </div>
                <button
                  className={`squad-action-btn ${isMyTeam ? "gold-btn" : ""}`}
                  onClick={() => navigate("/squad")}
                >
                  {isMyTeam ? "MANAGE" : "VIEW"}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <div className="stats-dashboard-row">
        {/* جدول تصنيف السكوادات */}
        <div className="glass-panel">
          <div className="panel-header">
            <h3>RANKINGS</h3>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>TEAM</th>
                  <th className="text-right">PTS</th>
                </tr>
              </thead>
              <tbody>
                {displayTeams.map((t) => (
                  <tr
                    key={t._id}
                    className={myFullTeam?._id === t._id ? "highlight-row" : ""}
                  >
                    <td>{t.name}</td>
                    <td className="text-right points-highlight">
                      {t.points || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* جدول أعضاء السكواد */}
        <div className="glass-panel gold-border-panel">
          <div
            className="panel-header"
            style={{ display: "flex", justifyContent: "space-between" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <FaMedal className="gold-icon" />
              <h3>{showAllMembers ? "ALL WARRIORS" : "TOP 10"}</h3>
              {(isLeader || isCoLeader) && (
                <button
                  onClick={handleResetPoints}
                  className="reset-points-btn"
                >
                  <FaTrashAlt /> تصفير
                </button>
              )}
            </div>
            {myFullTeam?.members?.length > 10 && (
              <div
                className="toggle-view-btn"
                onClick={() => setShowAllMembers(!showAllMembers)}
              >
                <span style={{ fontSize: "0.7rem" }}>
                  {showAllMembers ? "MINIMIZE" : "ALL"}
                </span>
              </div>
            )}
          </div>

          <div
            className="table-responsive"
            style={{
              maxHeight: showAllMembers ? "400px" : "none",
              overflowY: "auto",
            }}
          >
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>WARRIOR</th>
                  <th className="text-right">PTS</th>
                </tr>
              </thead>
              <tbody>
                {myFullTeam?.members ? (
                  visibleMembers.map((m, idx) => (
                    <tr
                      key={m._id || idx}
                      className={
                        currentUserId === (m._id || m.id) ? "highlight-row" : ""
                      }
                    >
                      <td>
                        <span className={`rank-badge rank-${idx + 1}`}>
                          {idx + 1}
                        </span>
                      </td>
                      <td>{m.username}</td>
                      <td className="text-right points-highlight">
                        {m.trainingPoints || 0}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3">NO DATA</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
