import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import Swal from "sweetalert2";
import {
  FaArrowLeft,
  FaTrophy,
  FaPlay,
  FaCheckCircle,
  FaKhanda,
  FaTable,
  FaUndo,
  FaBolt,
} from "react-icons/fa";
import "./MatchSchedule.css";

const MatchSchedule = () => {
  const navigate = useNavigate();
  const { state } = useLocation();
  const token = localStorage.getItem("token");

  const [tournament, setTournament] = useState(state || null);
  const [activeRound, setActiveRound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showTieBreakerBtn, setShowTieBreakerBtn] = useState(false);

  // استخدام useRef لمنع تداخل طلبات الـ Refresh المتكررة (حل مشكلة الـ Pending)
  const isRefreshing = useRef(false);

  const formatTeamName = (name) => {
    if (!name) return "TBD";
    return name.split(" - ")[0];
  };

  const checkTieCondition = useCallback((data) => {
    if (data.systemType === "league" && data.status === "active") {
      const allDone = data.leagueMatches?.every((m) => m.winner);
      setShowTieBreakerBtn(!!allDone);
    }
  }, []);

  const refreshTournament = useCallback(
    async (showLoading = false) => {
      const tId = tournament?._id || state?._id;
      if (!tId || isRefreshing.current) return;

      try {
        if (showLoading) setLoading(true);
        isRefreshing.current = true;

        const res = await axios.get(
          `http://localhost:5000/api/tournament/${tId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (res.data) {
          setTournament(res.data);
          checkTieCondition(res.data);
        }
      } catch (err) {
        console.error("❌ Fetch Error:", err);
      } finally {
        isRefreshing.current = false;
        if (showLoading) setLoading(false);
      }
    },
    [token, tournament?._id, state?._id, checkTieCondition],
  );

  useEffect(() => {
    if (!token) return navigate("/login");

    const initAuthAndData = async () => {
      try {
        setLoading(true);
        // طلب البيانات مع التأكد من تحديث حالة الـ Authorized
        const [profileRes, teamDataRes] = await Promise.all([
          axios.get("http://localhost:5000/api/tournament/profile", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          axios.get("http://localhost:5000/api/tournament/my-team", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const user = profileRes.data.user || profileRes.data;
        const squad = teamDataRes?.data || null;

        const myId = String(user._id || user.id || "");
        const role = String(user.role || "").toLowerCase();

        // فحص دقيق للصلاحيات
        const leaderIdInSquad = squad?.leader?._id
          ? String(squad.leader._id)
          : String(squad?.leader || "");

        const coLeaderIds =
          squad?.coLeaders?.map((cl) =>
            typeof cl === "object" ? String(cl._id) : String(cl),
          ) || [];

        const hasAccess =
          role === "leader" ||
          role === "admin" ||
          myId === leaderIdInSquad ||
          coLeaderIds.includes(myId);

        setIsAuthorized(hasAccess);
        await refreshTournament();
      } catch (e) {
        console.error("❌ Auth Sync Error:", e);
      } finally {
        setLoading(false);
      }
    };

    initAuthAndData();
    const interval = setInterval(() => refreshTournament(false), 10000); // زيادة الوقت قليلاً لتقليل الـ Pending
    return () => clearInterval(interval);
  }, [token, refreshTournament, navigate]);

  const handleGenerateTieBreaker = async () => {
    if (!isAuthorized || loading) return;

    const result = await Swal.fire({
      title: "إنشاء مباراة فاصلة؟",
      text: "سيتم توليد مواجهة نهائية لكسر التعادل",
      icon: "info",
      showCancelButton: true,
      confirmButtonText: "انطلق",
      background: "#0a0a0c",
      color: "#fff",
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        const res = await axios.post(
          "http://localhost:5000/api/tournament/generate-tiebreaker",
          { tournamentId: tournament._id },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setTournament(res.data);
        setShowTieBreakerBtn(false);
        Swal.fire("تم!", "تم إنشاء المباراة الفاصلة", "success");
      } catch (err) {
        Swal.fire("خطأ", "فشل إنشاء المباراة", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSetWinner = async (team, mIdx, rIdx = null) => {
    if (!isAuthorized) {
      return Swal.fire({
        title: "🛡️ تنبيه القائد",
        text: "يجب أن تكون القائد لتعديل النتائج",
        icon: "warning",
        background: "#0a0a0c",
        color: "#fff",
      });
    }

    if (loading || tournament.status === "finished") return;

    const result = await Swal.fire({
      title: "تأكيد الفوز",
      text: `هل فريق ${formatTeamName(team.name)} هو الفائز؟`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "نعم، مؤكد",
      background: "#0a0a0c",
      color: "#fff",
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        const { data } = await axios.post(
          "http://localhost:5000/api/tournament/report-win",
          {
            tournamentId: tournament._id,
            winnerTeamId: String(team._id || team.id),
            matchIdx: mIdx,
            roundIdx: rIdx,
          },
          { headers: { Authorization: `Bearer ${token}` } },
        );

        setTournament(data);
        checkTieCondition(data);
        Swal.fire("ممتاز!", "تم تحديث النتيجة", "success");
      } catch (err) {
        Swal.fire("خطأ", "لم يتم حفظ النتيجة", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleUndo = async () => {
    if (!isAuthorized || loading) return;

    const result = await Swal.fire({
      title: "تراجع؟",
      text: "سيتم حذف آخر نتيجة مسجلة",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "تراجع الآن",
      background: "#0a0a0c",
      color: "#fff",
    });

    if (result.isConfirmed) {
      setLoading(true);
      try {
        const res = await axios.post(
          "http://localhost:5000/api/tournament/undo-match",
          { tournamentId: tournament._id },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        setTournament(res.data);
        Swal.fire("تم", "تم التراجع عن النتيجة", "success");
      } catch (err) {
        Swal.fire("خطأ", "لا يمكن التراجع حالياً", "error");
      } finally {
        setLoading(false);
      }
    }
  };

  if (!tournament)
    return (
      <div className="dark-loader">
        <div className="spinner"></div>
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
            <span className="admin-status">🛡️ LEADER ACCESS</span>
          )}
        </div>

        <div className="nav-controls">
          {isAuthorized && showTieBreakerBtn && (
            <button
              className="btn-tie-breaker pulse-gold"
              onClick={handleGenerateTieBreaker}
            >
              <FaBolt /> TIE BREAKER
            </button>
          )}

          {isAuthorized &&
            (tournament.rounds?.length > 0 ||
              tournament.leagueMatches?.length > 0) && (
              <button
                className="btn-undo"
                onClick={handleUndo}
                disabled={loading}
              >
                <FaUndo /> {loading ? "..." : "UNDO"}
              </button>
            )}
        </div>
      </nav>

      <div className="battle-stage animated-fade">
        <div className="bracket-container">
          {isLeague ? (
            <div className="league-container">
              <h2 className="league-title">
                <FaTable /> LEAGUE MATCHES
              </h2>
              <div className="matches-grid">
                {tournament.leagueMatches?.map((match, idx) => (
                  <MatchCard
                    key={idx}
                    match={match}
                    idx={idx}
                    roundIdx={null}
                    isAuthorized={isAuthorized}
                    handleSetWinner={handleSetWinner}
                    formatTeamName={formatTeamName}
                    loading={loading}
                  />
                ))}
              </div>
            </div>
          ) : (
            <>
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
              <div className="matches-grid">
                {tournament.rounds[activeRound]?.matches?.map((match, idx) => (
                  <MatchCard
                    key={idx}
                    match={match}
                    idx={idx}
                    roundIdx={activeRound}
                    isAuthorized={isAuthorized}
                    handleSetWinner={handleSetWinner}
                    formatTeamName={formatTeamName}
                    loading={loading}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {tournament.status === "finished" && (
        <div className="victory-overlay">
          <div className="victory-card">
            <FaTrophy className="crown-icon" />
            <p>SUPREME CHAMPION</p>
            <h1 className="winner-name">
              {formatTeamName(tournament.finalWinner?.name)}
            </h1>
            <button
              className="exit-btn"
              onClick={() => navigate("/matchmaking")}
            >
              BACK TO TEAMS
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const MatchCard = ({
  match,
  idx,
  roundIdx,
  isAuthorized,
  handleSetWinner,
  formatTeamName,
  loading,
}) => {
  const winnerId = match.winner
    ? String(match.winner._id || match.winner)
    : null;
  const teamAId = match.teamA
    ? String(match.teamA._id || match.teamA.id)
    : null;
  const teamBId = match.teamB
    ? String(match.teamB._id || match.teamB.id)
    : null;

  return (
    <div className="match-card-wrapper">
      <div className="match-box-ui">
        <div
          className={`team-slot ${isAuthorized && !winnerId && !loading ? "clickable" : "read-only"} ${winnerId && teamAId === winnerId ? "winner" : ""}`}
          onClick={() =>
            !winnerId &&
            !loading &&
            match.teamA &&
            handleSetWinner(match.teamA, idx, roundIdx)
          }
        >
          <span className="t-name">{formatTeamName(match.teamA?.name)}</span>
          {winnerId && teamAId === winnerId && (
            <FaCheckCircle className="check-icon" />
          )}
        </div>
        <div className="vs-divider">VS</div>
        <div
          className={`team-slot ${isAuthorized && !winnerId && !loading ? "clickable" : "read-only"} ${winnerId && teamBId === winnerId ? "winner" : ""}`}
          onClick={() =>
            !winnerId &&
            !loading &&
            match.teamB &&
            handleSetWinner(match.teamB, idx, roundIdx)
          }
        >
          <span className="t-name">{formatTeamName(match.teamB?.name)}</span>
          {winnerId && teamBId === winnerId && (
            <FaCheckCircle className="check-icon" />
          )}
        </div>
      </div>
    </div>
  );
};

export default MatchSchedule;
