import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import {
  FaArrowLeft,
  FaTrophy,
  FaCheckCircle,
  FaKhanda,
  FaTable,
  FaUndo,
  FaBolt,
  FaClock,
} from "react-icons/fa";
import "./MatchSchedule.css";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const MatchSchedule = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const token = localStorage.getItem("token");

  const [tournament, setTournament] = useState(state || null);
  const [activeRound, setActiveRound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showTieBreakerBtn, setShowTieBreakerBtn] = useState(false);

  const isRefreshing = useRef(false);

  // تنسيق اسم الفريق ليظهر بشكل أنيق
  const formatTeamName = useCallback((name) => {
    if (!name) return "بانتظار المنافس...";
    return name.split(" - ")[0];
  }, []);

  // فحص شروط التعادل في نظام الدوري
  const checkTieCondition = useCallback((data) => {
    if (data.systemType === "league" && data.status === "active") {
      const allDone = data.leagueMatches?.every((m) => m.winner);
      setShowTieBreakerBtn(!!allDone);
    }
  }, []);

  const refreshTournament = useCallback(
    async (showLoading = false) => {
      const tId = tournament?._id || state?._id;
      if (isRefreshing.current || !token) return;

      try {
        if (showLoading) setLoading(true);
        isRefreshing.current = true;

        const url = tId
          ? `${API_BASE_URL}/api/tournament/${tId}`
          : `${API_BASE_URL}/api/tournament/current`;

        const res = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.data) {
          setTournament(res.data);
          checkTieCondition(res.data);
        }
      } catch (err) {
        if (err.response?.status === 404) setTournament(null);
      } finally {
        isRefreshing.current = false;
        if (showLoading) setLoading(false);
      }
    },
    [token, tournament?._id, state?._id, checkTieCondition],
  );

  useEffect(() => {
    if (!token) return navigate("/login");

    const init = async () => {
      try {
        setLoading(true);
        // جلب الملف الشخصي والسكواد للتأكد من الصلاحيات
        const [profileRes, teamDataRes] = await Promise.all([
          axios
            .get(`${API_BASE_URL}/api/auth/profile`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            .catch(() => null),
          axios
            .get(`${API_BASE_URL}/api/auth/my-team`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            .catch(() => null),
        ]);

        if (profileRes?.data) {
          const user = profileRes.data;
          const squad = teamDataRes?.data;
          const myId = String(user._id || user.id);

          const leaderId = squad?.leader?._id
            ? String(squad.leader._id)
            : String(squad?.leader || "");
          const coLeaders =
            squad?.coLeaders?.map((cl) => String(cl._id || cl)) || [];

          setIsAuthorized(
            myId === leaderId ||
              coLeaders.includes(myId) ||
              user.role === "admin",
          );
        }
        await refreshTournament();
      } finally {
        setLoading(false);
      }
    };

    init();
    const interval = setInterval(() => refreshTournament(false), 10000);
    return () => clearInterval(interval);
  }, [token, navigate, refreshTournament]);

  const handleSetWinner = async (team, mIdx, rIdx = null) => {
    if (!isAuthorized) return; // منع التفاعل لغير المخولين
    if (loading || tournament.status === "finished" || !team) return;

    const result = await Swal.fire({
      title: "تأكيد النتيجة",
      text: `هل أنت متأكد من فوز فريق ${formatTeamName(team.name)}؟`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "نعم، فائز",
      confirmButtonColor: "#28a745",
      background: "#0a0a0c",
      color: "#fff",
    });

    if (result.isConfirmed) {
      try {
        setLoading(true);
        const { data } = await axios.post(
          `${API_BASE_URL}/api/tournament/report-win`,
          {
            tournamentId: tournament._id,
            winnerTeamId: team._id,
            matchIdx: mIdx,
            roundIdx: rIdx,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setTournament(data);
        checkTieCondition(data);
        Swal.fire({
          icon: "success",
          title: "تم التسجيل",
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (err) {
        Swal.fire("خطأ", "حدثت مشكلة أثناء حفظ النتيجة", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleUndo = async () => {
    if (!isAuthorized || loading) return;
    const result = await Swal.fire({
      title: "تراجع؟",
      text: "سيتم حذف آخر نتيجة مسجلة في البطولة",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "تراجع",
      background: "#0a0a0c",
      color: "#fff",
    });

    if (result.isConfirmed) {
      try {
        setLoading(true);
        const res = await axios.post(
          `${API_BASE_URL}/api/tournament/undo-match`,
          { tournamentId: tournament._id },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setTournament(res.data);
      } catch {
        Swal.fire("خطأ", "لا يوجد جولات للتراجع عنها", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  if (!tournament && loading)
    return (
      <div className="dark-loader">
        <div className="spinner"></div>
      </div>
    );
  if (!tournament)
    return (
      <div className="dark-loader">
        <p>لا توجد بطولة نشطة حالياً</p>
        <button
          onClick={() => navigate("/matchmaking")}
          className="home-neon-btn"
        >
          عودة
        </button>
      </div>
    );

  const isLeague = tournament.systemType === "league";

  return (
    <div className="arena-wrapper">
      <div className="bg-vignette"></div>

      <nav className="arena-top-nav">
        <button
          className="home-neon-btn"
          onClick={() => navigate("/matchmaking")}
        >
          <FaArrowLeft />
        </button>
        <div className="tournament-brand">
          <FaKhanda className="brand-icon" />
          <span>{tournament.systemType?.toUpperCase()} ARENA</span>
          {isAuthorized && (
            <span className="admin-status pulse-gold">🛡️ LEADER MODE</span>
          )}
        </div>
        <div className="nav-controls">
          {isAuthorized && showTieBreakerBtn && (
            <button className="btn-tie-breaker pulse-gold" onClick={() => {}}>
              <FaBolt /> TIE BREAKER
            </button>
          )}
          {isAuthorized && (
            <button
              className="btn-undo"
              onClick={handleUndo}
              disabled={loading}
            >
              <FaUndo />
            </button>
          )}
        </div>
      </nav>

      <div className="battle-stage animated-fade">
        <div className="bracket-container">
          {!isLeague && (
            <div className="round-tabs">
              {tournament.rounds?.map((_, i) => (
                <button
                  key={i}
                  className={activeRound === i ? "tab active" : "tab"}
                  onClick={() => setActiveRound(i)}
                >
                  ROUND {i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="matches-grid">
            {(isLeague
              ? tournament.leagueMatches
              : tournament.rounds[activeRound]?.matches
            )?.map((match, idx) => (
              <MatchCard
                key={idx}
                match={match}
                idx={idx}
                roundIdx={isLeague ? null : activeRound}
                isAuthorized={isAuthorized}
                handleSetWinner={handleSetWinner}
                formatTeamName={formatTeamName}
                loading={loading}
              />
            ))}
          </div>
        </div>
      </div>

      {tournament.status === "finished" && (
        <div className="victory-overlay animated-fade">
          <div className="victory-card">
            <FaTrophy className="crown-icon" />
            <p>CHAMPION</p>
            <h1 className="winner-name">
              {formatTeamName(tournament.finalWinner?.name)}
            </h1>
            <button
              className="exit-btn"
              onClick={() => navigate("/matchmaking")}
            >
              FINISH
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// مكون المباراة الفرعي
const MatchCard = ({
  match,
  idx,
  roundIdx,
  isAuthorized,
  handleSetWinner,
  formatTeamName,
  loading,
}) => {
  const winnerId = match.winner?._id || match.winner;
  const renderTeam = (team, type) => {
    const isThisWinner = winnerId && (team?._id || team?.id) === winnerId;
    return (
      <div
        className={`team-slot ${isAuthorized && !winnerId && team ? "clickable" : "read-only"} ${isThisWinner ? "winner" : ""}`}
        onClick={() => team && handleSetWinner(team, idx, roundIdx)}
      >
        <span className="t-name">{formatTeamName(team?.name)}</span>
        {isThisWinner && <FaCheckCircle className="check-icon" />}
      </div>
    );
  };

  return (
    <div className="match-card-wrapper">
      <div className="match-box-ui">
        {renderTeam(match.teamA, "A")}
        <div className="vs-divider">{winnerId ? "RESULT" : "VS"}</div>
        {renderTeam(match.teamB, "B")}
      </div>
    </div>
  );
};

export default MatchSchedule;
