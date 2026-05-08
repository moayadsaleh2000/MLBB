import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import { io } from "socket.io-client";
import {
  FaHome,
  FaTrophy,
  FaCheckCircle,
  FaClock,
  FaUsers,
  FaShieldAlt,
} from "react-icons/fa";
import "./Matches.css";

// استخدام الرابط الديناميكي (يتغير تلقائياً عند الرفع على Vercel)
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const Matches = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const token = localStorage.getItem("token");

  // States
  const [tournament, setTournament] = useState(state || null);
  const [queue, setQueue] = useState({ queueCount: 0, teams: [] });
  const [activeRound, setActiveRound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const socketRef = useRef(null);

  const formatName = (name) => {
    if (!name) return "TBD";
    return name.split(" - ")[0];
  };

  // 1. جلب قائمة الانتظار
  const fetchQueue = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/tournament/qualifying/queue`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = res.data;
      const queueData = data.data || data;
      setQueue({
        queueCount:
          queueData.queueCount ||
          (queueData.teams ? queueData.teams.length : 0),
        teams: Array.isArray(queueData.teams) ? queueData.teams : [],
      });
    } catch (err) {
      console.error("Queue fetch error:", err);
    }
  }, [token]);

  // 2. تحديث بيانات البطولة النشطة
  const refreshData = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/tournament/qualifying/active`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (res.data && res.data._id) {
        setTournament(res.data);
        if (res.data.systemType === "bracket" && res.data.rounds) {
          const lastIdx = res.data.rounds.length - 1;
          setActiveRound((prev) => (prev > lastIdx ? lastIdx : prev));
        }
      } else {
        setTournament(null);
        fetchQueue();
      }
    } catch (err) {
      setTournament(null);
      fetchQueue();
    }
  }, [token, fetchQueue]);

  // 3. التحقق من الصلاحية
  useEffect(() => {
    const checkAuth = async () => {
      if (!token) {
        navigate("/");
        return;
      }

      try {
        const res = await axios.get(`${API_BASE_URL}/api/tournament/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const user = res.data.user || res.data;
        const role = String(user.role || "").toLowerCase();
        const hasAccess =
          user.isLeader ||
          user.isCoLeader ||
          ["leader", "admin", "co-leader"].includes(role);

        setIsAuthorized(hasAccess);
      } catch (err) {
        setIsAuthorized(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
    refreshData();
  }, [token, navigate, refreshData]);

  // 4. إعداد السوكيت باستخدام الرابط الديناميكي
  useEffect(() => {
    if (!token || isCheckingAuth) return;

    if (!socketRef.current) {
      socketRef.current = io(API_BASE_URL, {
        auth: { token },
        transports: ["websocket"],
        reconnection: true,
        reconnectionAttempts: 5,
      });

      socketRef.current.on("tournamentStarted", (newTournament) => {
        setTournament(newTournament);
      });

      socketRef.current.on("qualifyingQueueUpdated", (updatedQueue) => {
        setQueue({
          queueCount: updatedQueue.count,
          teams: updatedQueue.teams,
        });
      });

      socketRef.current.on("tournamentUpdated", (updatedTournament) => {
        setTournament(updatedTournament);
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [token, isCheckingAuth]);

  const handleStartTournament = async () => {
    if (queue.queueCount < 2) return;
    setLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/tournament/qualifying/start`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setTournament(res.data);
    } catch (err) {
      Swal.fire("خطأ", "فشل في بدء البطولة", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSetWinner = async (team, mIdx, rIdx = null) => {
    if (!isAuthorized || tournament?.status === "finished") return;

    const result = await Swal.fire({
      title: "تأكيد",
      text: `اعتماد فوز ${formatName(team.name)}؟`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "تأكيد الفوز",
      background: "#0d0d0f",
      color: "#d4af37",
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        const { data } = await axios.post(
          `${API_BASE_URL}/api/tournament/qualifying/report-win`,
          {
            tournamentId: tournament._id,
            winnerTeamId: team._id || team.id,
            matchIdx: mIdx,
            roundIdx: rIdx,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setTournament(data);
      } catch (err) {
        Swal.fire("خطأ", "فشل تسجيل النتيجة", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleUndoWinner = async (mIdx, rIdx = null) => {
    if (!isAuthorized || !tournament?._id || tournament?.status === "finished")
      return;

    const result = await Swal.fire({
      title: "تراجع عن النتيجة؟",
      text: "سيتم حذف الفائز الحالي لهذه المباراة",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "نعم، تراجع",
      cancelButtonText: "إلغاء",
      background: "#0d0d0f",
      color: "#d4af37",
    });

    if (!result.isConfirmed) return;

    setLoading(true);
    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/api/tournament/qualifying/undo-win`,
        {
          tournamentId: tournament._id,
          matchIdx: mIdx,
          roundIdx: rIdx,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setTournament(data);
      Swal.fire("تم التراجع", "تم حذف الفائز بنجاح", "success");
    } catch (err) {
      Swal.fire("خطأ", err.response?.data?.error || "فشل التراجع", "error");
    } finally {
      setLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div
        className="arena-wrapper"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div className="loader-neon">جاري الدخول إلى الساحة...</div>
      </div>
    );
  }

  if (!token) return null;

  if (!tournament || !tournament._id) {
    return (
      <div className="arena-wrapper">
        <div className="bg-vignette"></div>
        <nav className="arena-top-nav">
          <button className="home-neon-btn" onClick={() => navigate("/home")}>
            <FaHome />
          </button>
          <div className="tournament-brand">
            <FaClock className="brand-icon" />
            <span>غرفة الانتظار</span>
          </div>
          {isAuthorized && (
            <button
              className="btn-ignite-nav start-pulse"
              onClick={handleStartTournament}
              disabled={loading || queue.queueCount < 2}
            >
              {loading ? "جاري التحميل..." : "إبدأ التصفيات"}
            </button>
          )}
        </nav>
        <div className="center-stage">
          <div className="queue-header">
            <FaUsers /> <h2>السكوادات ({queue.queueCount})</h2>
          </div>
          <div className="queue-grid">
            {queue.teams.map((team, idx) => (
              <div key={team._id || idx} className="queue-card active-team">
                <img
                  src={
                    team.logo || `https://ui-avatars.com/api/?name=${team.name}`
                  }
                  alt="logo"
                />
                <h3>{formatName(team.name)}</h3>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isLeague = tournament.systemType === "league";
  const matchesToDisplay = isLeague
    ? tournament.leagueMatches || []
    : tournament.rounds?.[activeRound]?.matches || [];

  return (
    <div className="arena-wrapper">
      <div className="bg-vignette"></div>
      <nav className="arena-top-nav">
        <button className="home-neon-btn" onClick={() => navigate("/home")}>
          <FaHome />
        </button>
        <div className="tournament-brand">
          <FaShieldAlt className="brand-icon" />
          <span>ساحة المعركة</span>
        </div>
      </nav>

      <div className="battle-stage animated-fade">
        <div className="battle-content">
          {!isLeague && tournament.rounds?.length > 1 && (
            <div className="round-tabs">
              {tournament.rounds.map((_, i) => (
                <button
                  key={i}
                  className={activeRound === i ? "tab active" : "tab"}
                  onClick={() => setActiveRound(i)}
                >
                  الجولة {i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="matches-grid">
            {matchesToDisplay.map((match, idx) => {
              const winnerId = match.winner?._id || match.winner;
              return (
                <div key={idx} className="match-card-wrapper">
                  <div className="match-box-ui">
                    {[match.teamA, match.teamB].map((team, tIdx) => {
                      const teamId = team?._id || team?.id;
                      const isWinner =
                        winnerId && String(winnerId) === String(teamId);
                      return (
                        <React.Fragment key={tIdx}>
                          <div
                            className={`team-slot ${isAuthorized && !winnerId && team ? "clickable" : ""} ${isWinner ? "winner" : ""}`}
                            onClick={() =>
                              team &&
                              !winnerId &&
                              isAuthorized &&
                              handleSetWinner(
                                team,
                                idx,
                                isLeague ? null : activeRound,
                              )
                            }
                          >
                            <span className="t-name">
                              {formatName(team?.name)}
                            </span>
                            {isWinner && (
                              <FaCheckCircle className="check-icon" />
                            )}
                          </div>
                          {tIdx === 0 && <div className="vs-divider">VS</div>}
                        </React.Fragment>
                      );
                    })}
                  </div>
                  {isAuthorized &&
                    winnerId &&
                    tournament?.status !== "finished" && (
                      <button
                        className="undo-btn-neon"
                        onClick={() =>
                          handleUndoWinner(idx, isLeague ? null : activeRound)
                        }
                        disabled={loading}
                      >
                        {loading ? "جاري التراجع..." : "تراجع عن النتيجة"}
                      </button>
                    )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {tournament.status === "finished" && (
        <div className="victory-overlay">
          <div className="victory-card">
            <FaTrophy className="crown-icon" />
            <h1 className="winner-name">
              {formatName(tournament.finalWinner?.name)}
            </h1>
            <button className="exit-btn" onClick={() => navigate("/home")}>
              العودة
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Matches;
