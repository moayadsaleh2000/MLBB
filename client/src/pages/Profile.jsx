import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaUserCircle,
  FaTrophy,
  FaGamepad,
  FaArrowLeft,
  FaEllipsisV,
  FaFire,
  FaShieldAlt,
} from "react-icons/fa";
import axios from "axios";
import Swal from "sweetalert2";
import "./Profile.css";

// 1. تعريف رابط الـ API بشكل ديناميكي
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const Profile = () => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(true);

  const token = localStorage.getItem("token");

  // 2. تحديث الروابط لتستخدم الـ API_URL الجديد
  const PROFILE_URL = `${API_URL}/api/auth/profile`;
  const TEAM_URL = `${API_URL}/api/auth/my-team`;

  const [user, setUser] = useState(null);
  const [currentTeamName, setCurrentTeamName] = useState("SOLO");

  const [formData, setFormData] = useState({
    gameId: "",
    highestRank: "Epic",
    isActive: false,
    primaryLane: "Mid Lane",
    secondaryLane: "Roamer",
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

  const fetchProfileData = useCallback(async () => {
    if (!token) {
      navigate("/");
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // جلب بيانات البروفايل وبيانات الفريق بشكل متوازي (Parallel)
      const [profileRes, teamRes] = await Promise.all([
        axios.get(PROFILE_URL, { headers }),
        axios.get(TEAM_URL, { headers }).catch(() => ({ data: null })),
      ]);

      if (profileRes.data) {
        setUser(profileRes.data);
        setCurrentTeamName(teamRes.data ? teamRes.data.name : "SOLO");

        setFormData({
          gameId: profileRes.data.gameId || "",
          highestRank: profileRes.data.highestRank || "Epic",
          isActive: profileRes.data.isActive || false,
          primaryLane: profileRes.data.primaryLane || "Mid Lane",
          secondaryLane: profileRes.data.secondaryLane || "Roamer",
        });
      }
    } catch (err) {
      console.error("Fetch Profile Error:", err);
      if (err.response?.status === 401) {
        localStorage.clear();
        navigate("/");
      }
    } finally {
      setLoading(false);
    }
  }, [token, navigate, PROFILE_URL, TEAM_URL]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  const handleSave = async () => {
    try {
      Swal.fire({
        title: "SYNCING PROTOCOL...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
        background: "#0a0e14",
        color: "#ffd700",
      });

      const res = await axios.put(PROFILE_URL, formData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUser(res.data);
      setIsEditing(false);

      localStorage.setItem("user", JSON.stringify(res.data));

      Swal.fire({
        icon: "success",
        title: "PROFILE SYNCED!",
        text: "Your combat data has been updated.",
        background: "#0a0e14",
        color: "#ffd700",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: "Update Failed",
        text: err.response?.data?.message || "Check Connection",
        background: "#0a0e14",
        color: "#ff4d4d",
      });
    }
  };

  if (loading)
    return <div className="loader-gold">⚔️ ACCESSING ARCHIVES...</div>;

  return (
    <div className="profile-wrapper gold-theme">
      <header className="profile-nav gold-border">
        <button className="back-btn-gold" onClick={() => navigate("/home")}>
          <FaArrowLeft />
        </button>
        <h2 className="nav-title-gold">PLAYER PROTOCOL</h2>
        <div className="menu-container">
          <FaEllipsisV
            className="menu-dot"
            onClick={() => setShowMenu(!showMenu)}
          />
          {showMenu && (
            <div className="dropdown-gold">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setShowMenu(false);
                }}
              >
                Edit Stats
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="profile-card">
        <div className="profile-header-gold">
          <div className="avatar-gold-frame">
            <FaUserCircle className="main-avatar-gold" />
            {user?.isActive && <div className="online-pulse"></div>}
          </div>
          <h1 className="user-display-name">
            {user?.username} <span>/</span>{" "}
            <small className="team-highlight">{currentTeamName}</small>
          </h1>
        </div>

        <div className="stats-grid">
          <div className="stat-box gold-glow">
            <label>
              <FaGamepad /> GAME ID
            </label>
            {!isEditing ? (
              <span className="val-cyan">{user?.gameId || "UNLINKED"}</span>
            ) : (
              <input
                type="text"
                value={formData.gameId}
                onChange={(e) =>
                  setFormData({ ...formData, gameId: e.target.value })
                }
              />
            )}
          </div>

          <div
            className={`stat-box status-trigger ${formData.isActive ? "active-ready" : "active-idle"}`}
          >
            <label>
              <FaFire /> BATTLE READINESS
            </label>
            {!isEditing ? (
              <span className="val-status">
                {user?.isActive ? "READY TO FIGHT" : "IDLE"}
              </span>
            ) : (
              <div
                className="toggle-switch"
                onClick={() =>
                  setFormData({ ...formData, isActive: !formData.isActive })
                }
              >
                <div
                  className={`switch-ball ${formData.isActive ? "on" : "off"}`}
                ></div>
                <span>{formData.isActive ? "ACTIVE" : "INACTIVE"}</span>
              </div>
            )}
          </div>

          <div className="stat-box">
            <label>
              <FaTrophy /> HIGHEST RANK
            </label>
            {!isEditing ? (
              <span className="val-gold">{user?.highestRank}</span>
            ) : (
              <select
                value={formData.highestRank}
                onChange={(e) =>
                  setFormData({ ...formData, highestRank: e.target.value })
                }
              >
                {ranks.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="stat-box">
            <label>
              <FaShieldAlt /> PRIMARY ROLE
            </label>
            {!isEditing ? (
              <span>{user?.primaryLane}</span>
            ) : (
              <select
                value={formData.primaryLane}
                onChange={(e) =>
                  setFormData({ ...formData, primaryLane: e.target.value })
                }
              >
                {lanes.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {isEditing && (
          <div className="action-footer">
            <button className="btn-save-gold" onClick={handleSave}>
              SAVE TO CLOUD
            </button>
            <button className="btn-cancel" onClick={() => setIsEditing(false)}>
              CANCEL
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;
