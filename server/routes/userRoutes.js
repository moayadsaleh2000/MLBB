const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const matchmakingController = require("../controllers/matchmakingController");
const tournamentController = require("../controllers/tournamentController");
const qualifyingController = require("../controllers/qualifyingController");

const { protect } = require("../middleware/authMiddleware");

// ==========================================
// 1. روابط المستخدم (User Routes)
// ==========================================
router.post("/login", authController.loginPlayer);
router.get("/profile", protect, authController.getUserProfile);
router.put("/profile", protect, authController.updateProfile);

// ==========================================
// 2. روابط الفريق والسكواد (الطلبات والإشعارات)
// ==========================================
router.get("/teams", protect, authController.getAllTeams);
router.get("/my-team", protect, authController.getMyTeam);

// روابط طلبات الانضمام
router.post("/teams/join/:teamId", protect, authController.sendJoinRequest);
router.get("/team/requests", protect, authController.getTeamRequests);

// الرد على الطلبات
router.post("/team/respond", protect, authController.respondToRequest);

// روابط الإدارة والتحكم بالأعضاء
router.post("/team/leave", protect, authController.leaveTeam);
router.post("/team/kick", protect, authController.kickMember);
router.post("/team/promote", protect, authController.promoteMember);
router.delete("/team/disband", protect, authController.disbandTeam);
router.post("/team/add-bots", protect, authController.generateBots);

// ==========================================
// 3. روابط الإعلانات (Announcements)
// ==========================================
router.get(
  "/team/announcements/latest",
  protect,
  authController.getLatestAnnouncement,
);
router.get("/team/notifications", protect, authController.getTeamNotifications);
router.post(
  "/team/announcement",
  protect,
  authController.updateTeamAnnouncement,
);

// ==========================================
// 4. روابط البطولات ونظام التأهيل (Tournaments & Matchmaking)
// ==========================================

// أ) الماتش ميكينج (Matchmaking)
router.post(
  "/matchmaking/balance",
  protect,
  matchmakingController.balanceTeams,
);

// ب) نظام التأهيل (Qualifying)
router.post(
  "/register-qualifying",
  protect,
  qualifyingController.registerForQualifying,
);
router.get("/qualifying/queue", protect, qualifyingController.getQueue);
router.post(
  "/qualifying/start",
  protect,
  qualifyingController.startQualifyingTournament,
);
router.get(
  "/qualifying/active",
  protect,
  qualifyingController.getActiveQualifying,
);
router.post(
  "/qualifying/report-win",
  protect,
  qualifyingController.reportQualifyingWin,
);
router.post(
  "/qualifying/undo-win",
  protect,
  qualifyingController.undoQualifyingWin,
);

// جـ) روابط البطولة (Tournament Management)
router.post("/create", protect, tournamentController.createTournament);
router.post("/report-win", protect, tournamentController.reportWin);
router.post("/undo-match", protect, tournamentController.undoMatch);

/**
 * التحديث الجديد: مسار كسر التعادل
 * يستخدم عند وجود تعادل في النقاط في نظام الدوري
 */
router.post(
  "/generate-tiebreaker",
  protect,
  tournamentController.generateTieBreaker,
);

// د) جلب البيانات (Queries)
router.get("/current", protect, tournamentController.getCurrentTournament);
router.get("/:id", protect, tournamentController.getTournamentById);

module.exports = router;
