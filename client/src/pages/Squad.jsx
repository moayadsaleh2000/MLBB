import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaBullhorn,
  FaUsers,
  FaCrown,
  FaHome,
  FaShieldAlt,
  FaRobot,
  FaMagic,
  FaEllipsisV,
  FaSignOutAlt,
  FaTrashAlt,
  FaHourglassHalf,
  FaEdit,
} from "react-icons/fa";
import axios from "axios";
import Swal from "sweetalert2";
import "./Squad.css";

// استخدام رابط الـ API من متغيرات البيئة
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const normalizeTeam = (team) => {
  if (!team) return null;

  return {
    ...team,
    members: Array.isArray(team.members) ? team.members : [],
    coLeaders: Array.isArray(team.coLeaders) ? team.coLeaders : [],
  };
};

const Squad = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const AUTH_URL = `${API_BASE_URL}/api/auth`;
  const TOURNAMENT_URL = `${API_BASE_URL}/api/tournament`;

  const [user, setUser] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [allTeams, setAllTeams] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };

      // جلب بيانات المستخدم والسكواد بشكل متوازي
      const [resUser, resMyTeam] = await Promise.all([
        axios.get(`${AUTH_URL}/profile`, { headers }),
        axios
          .get(`${TOURNAMENT_URL}/my-team`, { headers })
          .catch(() => ({ data: null })),
      ]);

      setUser(resUser.data);

      if (resMyTeam.data?._id) {
        const normalizedTeam = normalizeTeam(resMyTeam.data);
        setTeamData(normalizedTeam);
        // جلب آخر إعلان للسكواد
        try {
          const resAnn = await axios.get(
            `${TOURNAMENT_URL}/team/announcements/latest`,
            { headers },
          );
          setAnnouncement(
            resAnn.data?.content ||
              resAnn.data?.message ||
              normalizedTeam.announcement ||
              "",
          );
        } catch (annErr) {
          setAnnouncement(normalizedTeam.announcement || "");
        }
      } else {
        // إذا لم يكن لديه فريق، جلب الفرق المتاحة والطلبات المعلقة
        const [resAll, resPending] = await Promise.all([
          axios.get(`${TOURNAMENT_URL}/teams`, { headers }),
          axios
            .get(`${TOURNAMENT_URL}/team/requests`, { headers })
            .catch(() => ({ data: [] })),
        ]);

        setAllTeams(Array.isArray(resAll.data) ? resAll.data : []);
        setPendingRequests(
          resPending.data
            ?.filter((r) => r.status === "pending")
            .map((r) => r.teamId) || [],
        );
        setTeamData(null);
        setAnnouncement("");
      }
    } catch (err) {
      console.error("Fetch error:", err);
      if (err.response?.status === 401) navigate("/");
    } finally {
      setLoading(false);
    }
  }, [token, navigate, AUTH_URL, TOURNAMENT_URL]);

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }
    fetchData();
  }, [token, navigate, fetchData]);

  // تحديث الإعلان (أوامر القائد)
  const handleUpdateAnnouncement = async () => {
    const { value: text } = await Swal.fire({
      title: "تحديث أوامر السكواد",
      input: "textarea",
      inputValue: announcement,
      inputPlaceholder: "اكتب التعليمات الجديدة هنا...",
      showCancelButton: true,
      confirmButtonText: "تحديث",
      cancelButtonText: "إلغاء",
      confirmButtonColor: "#d4af37",
      background: "#141a21",
      color: "#fff",
    });

    if (text !== undefined) {
      try {
        const headers = { Authorization: `Bearer ${token}` };
        await axios.post(
          `${TOURNAMENT_URL}/team/announcement`,
          { content: text },
          { headers },
        );
        setAnnouncement(text);
        Swal.fire({
          icon: "success",
          title: "تم التحديث",
          background: "#141a21",
          color: "#fff",
        });
      } catch (err) {
        Swal.fire("خطأ", "فشل تحديث الإعلان", "error");
      }
    }
  };

  // توليد بوتات للسكواد (لأغراض الفحص أو التوازن)
  const handleGenerateBots = async () => {
    try {
      const result = await Swal.fire({
        title: "توليد محاربين وهميين؟",
        text: "سيتم ملء السكواد ببوتات جاهزة للقتال فوراً!",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "نعم، استدعِ البوتات",
        confirmButtonColor: "#d4af37",
        background: "#141a21",
        color: "#fff",
      });

      if (result.isConfirmed) {
        setLoading(true);
        await axios.post(
          `${TOURNAMENT_URL}/team/add-bots`,
          {},
          { headers: { Authorization: `Bearer ${token}` } },
        );
        fetchData();
      }
    } catch (err) {
      Swal.fire("خطأ", "فشلت العملية", "error");
    } finally {
      setLoading(false);
    }
  };

  // إجراءات الأعضاء (ترقية، طرد)
  const handleMemberAction = (member) => {
    const isCoLeader = teamData.coLeaders?.some(
      (id) => (id._id || id) === member._id,
    );

    Swal.fire({
      title: `إدارة: ${member.username}`,
      icon: "info",
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: isCoLeader ? "تنزيل رتبة" : "ترقية لمساعد",
      denyButtonText: `طرد من السكواد`,
      confirmButtonColor: "#d4af37",
      denyButtonColor: "#ff4d4d",
      background: "#141a21",
      color: "#fff",
    }).then(async (result) => {
      const headers = { Authorization: `Bearer ${token}` };
      if (result.isConfirmed) {
        try {
          await axios.post(
            `${TOURNAMENT_URL}/team/promote`,
            { memberId: member._id },
            { headers },
          );
          fetchData();
        } catch (err) {
          Swal.fire("خطأ", "فشل التحديث", "error");
        }
      } else if (result.isDenied) {
        try {
          await axios.post(
            `${TOURNAMENT_URL}/team/kick`,
            { memberId: member._id },
            { headers },
          );
          fetchData();
        } catch (err) {
          Swal.fire("خطأ", "فشل الطرد", "error");
        }
      }
    });
  };

  // حذف السكواد
  const handleDisbandTeam = () => {
    Swal.fire({
      title: "حذف السكواد؟",
      text: "سيتم حذف الفريق نهائياً ولا يمكن التراجع!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "نعم، احذف",
      confirmButtonColor: "#ff4d4d",
      background: "#141a21",
      color: "#fff",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await axios.delete(`${TOURNAMENT_URL}/team/disband`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          fetchData();
        } catch (err) {
          Swal.fire("خطأ", "فشل الحذف", "error");
        }
      }
    });
  };

  // طلب الانضمام لفريق
  const handleJoinRequest = async (teamId) => {
    try {
      await axios.post(
        `${TOURNAMENT_URL}/teams/join/${teamId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      Swal.fire({
        title: "تم الإرسال!",
        icon: "success",
        background: "#141a21",
        color: "#fff",
      });
      setPendingRequests((prev) => [...prev, teamId]);
    } catch (err) {
      Swal.fire(
        "خطأ",
        err.response?.data?.message || "فشل طلب الانضمام",
        "error",
      );
    }
  };

  if (loading) return <div className="loader-gold">⚔️ LOADING ARENA...</div>;

  const isOwner = user?._id === (teamData?.leader?._id || teamData?.leader);
  const totalMembers = teamData?.members?.length || 0;
  const activeCount =
    teamData?.members?.filter((m) => m.isActive === true).length || 0;

  return (
    <div className="squad-page gold-theme">
      <header className="squad-nav">
        <div className="nav-left">
          <button
            className="gold-btn-icon"
            onClick={() => navigate("/home")}
            title="الرئيسية"
          >
            <FaHome />
          </button>
          {teamData && isOwner && (
            <button
              className="gold-btn-icon trash-btn"
              onClick={handleDisbandTeam}
              title="حذف السكواد"
            >
              <FaTrashAlt style={{ color: "#ff4d4d" }} />
            </button>
          )}
        </div>
        <h1 className="nav-logo">
          {teamData ? teamData.name : "SQUAD EXPLORER"}
        </h1>
        <div className="nav-right">
          {teamData && isOwner && (
            <button
              className="gold-btn-icon bot-btn"
              onClick={handleGenerateBots}
              title="توليد بوتات"
            >
              <FaRobot style={{ color: "#d4af37" }} />
            </button>
          )}
        </div>
      </header>

      <div className="squad-container">
        {!teamData ? (
          <div className="explorer-view">
            <div className="teams-grid">
              {allTeams.length === 0 ? (
                <div className="mission-card gold-border">
                  <h3>
                    <FaUsers /> لا يوجد سكوادات متاحة حالياً
                  </h3>
                  <p className="mission-text">
                    جرّب لاحقاً أو اطلب من قائد فريق يرسلك دعوة انضمام.
                  </p>
                </div>
              ) : (
                allTeams.map((team) => {
                  const isPending = pendingRequests.includes(team._id);
                  return (
                    <div key={team._id} className="team-card gold-border">
                      <div className="team-info">
                        <h3>{team.name}</h3>
                        <p>
                          <FaCrown className="crown" />{" "}
                          {team.leader?.username || "Commander"}
                        </p>
                        <span className="member-count">
                          {team.members?.length || 0}/10 Members
                        </span>
                      </div>
                      <button
                        className={`join-btn ${isPending ? "pending-btn" : ""}`}
                        onClick={() =>
                          !isPending && handleJoinRequest(team._id)
                        }
                        disabled={isPending}
                      >
                        {isPending ? (
                          <>
                            <FaHourglassHalf /> PENDING
                          </>
                        ) : (
                          "REQUEST JOIN"
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="squad-view">
            <div className="mission-card gold-border">
              <div className="mission-header">
                <h3>
                  <FaBullhorn /> SQUAD MISSION
                </h3>
                {isOwner && (
                  <button
                    className="edit-ann-btn"
                    onClick={handleUpdateAnnouncement}
                  >
                    <FaEdit />
                  </button>
                )}
              </div>
              <p className="mission-text">
                {announcement || "بانتظار الأوامر من القائد..."}
              </p>
            </div>

            <div className="roster-section">
              <div className="section-header">
                <h3>
                  <FaUsers /> SQUAD ROSTER
                </h3>
                <span
                  className={`status-badge ${activeCount >= 10 ? "ready" : ""}`}
                >
                  {activeCount} / {totalMembers} READY
                </span>
              </div>

              <div className="roster-list-vertical">
                {teamData.members?.length === 0 ? (
                  <div className="mission-card gold-border">
                    <p className="mission-text">
                      لا يوجد أعضاء ظاهرين حالياً في هذا السكواد.
                    </p>
                  </div>
                ) : (
                  teamData.members?.map((member) => {
                    const isMemberLeader =
                      (teamData.leader?._id || teamData.leader) === member._id;
                    const isMemberCo = teamData.coLeaders?.some(
                      (id) => (id._id || id) === member._id,
                    );
                    const isOnline = member.isActive === true;

                    return (
                      <div
                        key={member._id}
                        className={`member-row-gold ${isOnline ? "row-active" : ""}`}
                      >
                        <div className="member-left">
                          <div className="member-avatar-wrapper">
                            <img
                              src={`https://ui-avatars.com/api/?name=${member.username}&background=d4af37&color=000`}
                              alt="avatar"
                            />
                            <div
                              className={`status-dot ${isOnline ? "on" : "off"}`}
                            ></div>
                          </div>
                          <div className="member-info-text">
                            <span className="m-name-bold">
                              {member.username}{" "}
                              {isMemberLeader && (
                                <FaCrown className="mini-crown" />
                              )}{" "}
                              {isMemberCo && (
                                <FaShieldAlt className="mini-shield" />
                              )}
                            </span>
                            <span className="m-lane-sub">
                              {isMemberLeader
                                ? "Squad Leader"
                                : isMemberCo
                                  ? "Co-Leader"
                                  : "Member"}
                            </span>
                          </div>
                        </div>
                        <div className="member-right">
                          {isOwner && !isMemberLeader && (
                            <button
                              className="options-btn-gold"
                              onClick={() => handleMemberAction(member)}
                            >
                              <FaEllipsisV />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {isOwner && (
              <div className="battle-footer">
                <button
                  className={`mega-battle-btn ${activeCount >= 10 ? "active" : "disabled"}`}
                  disabled={activeCount < 10}
                  onClick={() => navigate("/matchmaking")}
                >
                  <FaMagic />{" "}
                  {activeCount >= 10
                    ? "GENERATE BATTLE TEAMS"
                    : `NEED ${10 - activeCount} MORE READY`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Squad;
