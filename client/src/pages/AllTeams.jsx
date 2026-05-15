import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FaArrowRight, FaDumbbell, FaTrophy } from "react-icons/fa";
import { GiShield } from "react-icons/gi";
import axios from "axios";
import { io } from "socket.io-client";
import "./AllTeams.css";

// استخدام الرابط الديناميكي
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const isQualificationMode = (mode) =>
  mode === "qualification" || mode === "qualifying";

const normalizeStoredTeams = (stored) =>
  (stored || []).map((team, index) => ({
    _id: team._id || team.id || `team-${index}`,
    name: team.name || `فريق ${index + 1}`,
    players: (team.players || []).map((p) => ({
      _id: p._id || p.id,
      username: p.username,
      assignedLane: p.assignedLane,
    })),
  }));

const AllTeams = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [activeTournament, setActiveTournament] = useState(null);

  const applySquadActiveTournament = (squad) => {
    if (squad?.activeTournamentId) {
      setActiveTournament({
        _id: squad.activeTournamentId,
        mode: squad.activeTournamentMode,
      });
    } else {
      setActiveTournament(null);
    }
  };

  const fetchData = useCallback(async () => {
    if (!token) {
      navigate("/login");
      return;
    }

    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      const [profileRes, teamDataRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/auth/profile`, { headers }),
        axios.get(`${API_BASE_URL}/api/auth/my-team`, { headers }),
      ]);

      const user = profileRes.data;
      const squad = teamDataRes.data;

      const userId = String(user._id);
      const squadLeaderId = squad?.leader
        ? String(squad.leader._id || squad.leader)
        : null;
      const coLeaderIds =
        squad?.coLeaders?.map((cl) => String(cl._id || cl)) || [];

      const hasAccess =
        user.role === "Leader" ||
        user.role === "Co-Leader" ||
        user.isLeader === true ||
        userId === squadLeaderId ||
        coLeaderIds.includes(userId);

      setIsAuthorized(hasAccess);
      applySquadActiveTournament(squad);

      if (!squad?.members) return;

      if (hasAccess) {
        const res = await axios.post(
          `${API_BASE_URL}/api/auth/matchmaking/balance`,
          { members: squad.members },
          { headers },
        );
        if (res.data.success && res.data.teams?.length) {
          const balanced = res.data.teams || [];
          setTeams(balanced);
          await axios.post(
            `${API_BASE_URL}/api/auth/matchmaking/save`,
            { teams: balanced },
            { headers },
          );
        }
      } else if (squad.eliteTeams?.length) {
        setTeams(normalizeStoredTeams(squad.eliteTeams));
      }
    } catch (err) {
      console.error("Fetch Error:", err);
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!token) return undefined;

    const socket = io(API_BASE_URL, { auth: { token } });
    socket.on("tournamentUpdated", () => {
      fetchData();
    });

    return () => {
      socket.disconnect();
    };
  }, [token, fetchData]);

  const handleStartTournament = async (mode) => {
    try {
      // تنظيف الـ IDs لضمان عدم حدوث خطأ في الـ Backend
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

      // إنشاء البطولة
      const res = await axios.post(
        `${API_BASE_URL}/api/tournament/create`,
        { mode, teams: preparedTeams },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      // التوجيه للجدول الزمني للبطولة المنشأة حديثاً
      if (res.data && res.data._id) {
        setActiveTournament({ _id: res.data._id, mode });
        navigate(`/match-schedule/${res.data._id}`, { state: res.data });
      } else {
        alert("فشل السيرفر في إعادة معرف البطولة (ID)");
      }
    } catch (err) {
      console.error(
        "Tournament Start Error:",
        err.response?.data || err.message,
      );
      alert(err.response?.data?.error || "حدث خطأ أثناء بدء البطولة.");
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
          <p className="empty-msg">
            {isAuthorized
              ? "لا توجد فرق جاهزة حالياً"
              : "بانتظار توليد الفرق من القائد أو المساعد"}
          </p>
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

      {!isAuthorized && teams.length > 0 && activeTournament?._id && (
        <div className="admin-actions-bar member-actions-bar">
          <button
            className={`action-btn ${
              isQualificationMode(activeTournament.mode)
                ? "qualify"
                : "training"
            }`}
            onClick={() => navigate(`/match-schedule/${activeTournament._id}`)}
          >
            {isQualificationMode(activeTournament.mode) ? (
              <>
                <FaTrophy /> الانتقال للتأهيل
              </>
            ) : (
              <>
                <FaDumbbell /> الانتقال للتدريب
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default AllTeams;
