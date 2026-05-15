const User = require("../models/User");
const Team = require("../models/Team");
const Tournament = require("../models/Tournament");
const Announcement = require("../models/Announcement");
const jwt = require("jsonwebtoken");

const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

const canChangeUsername = (user) => {
  if (!user?.lastUsernameChangeAt) return true;
  return (
    Date.now() - new Date(user.lastUsernameChangeAt).getTime() >=
    USERNAME_CHANGE_COOLDOWN_MS
  );
};

const daysUntilUsernameChange = (user) => {
  if (!user?.lastUsernameChangeAt || canChangeUsername(user)) return 0;
  const remaining =
    USERNAME_CHANGE_COOLDOWN_MS -
    (Date.now() - new Date(user.lastUsernameChangeAt).getTime());
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
};

// --- 1. تسجيل الدخول ---
exports.loginPlayer = async (req, res) => {
  try {
    const {
      username,
      highestRank,
      primaryLane,
      secondaryLane,
      isLeader,
      teamName,
      gameId,
      status,
    } = req.body;

    let user = await User.findOneAndUpdate(
      { username: username.trim() },
      {
        $set: {
          highestRank: highestRank || "Epic",
          primaryLane: primaryLane || "Fill",
          secondaryLane: secondaryLane || "Fill",
          gameId: gameId || "",
          status: status || "Active",
          isOnline: true,
          isLeader: isLeader || false,
          teamName: isLeader
            ? teamName
              ? teamName.trim()
              : "New Squad"
            : "Solo Player",
        },
        $setOnInsert: { trainingPoints: 0, qualificationPoints: 0 },
      },
      { returnDocument: "after", upsert: true },
    );

    if (user.isLeader && user.teamName !== "Solo Player") {
      let team = await Team.findOne({
        $or: [{ leader: user._id }, { name: user.teamName }],
      });

      if (!team) {
        team = await Team.create({
          name: user.teamName,
          leader: user._id,
          members: [user._id],
          announcement: "أهلاً بكم في الفريق!",
          language: "Arabic",
        });

        await Announcement.create({
          teamId: team._id,
          authorId: user._id,
          message: team.announcement,
        });
      }

      user = await User.findByIdAndUpdate(
        user._id,
        { $set: { teamId: team._id } },
        { new: true },
      );
    } else {
      user = await User.findByIdAndUpdate(
        user._id,
        { $set: { teamId: null, teamName: "Solo Player", isLeader: false } },
        { new: true },
      );
    }

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        teamId: user.teamId,
      },
      process.env.JWT_SECRET,
      { expiresIn: "365d" },
    );

    res.status(200).json({ message: "Success", token, user });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// --- 2. جلب بيانات البروفايل ---
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user._id).select(
      "-password",
    );
    if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "خطأ في جلب البيانات" });
  }
};

// --- 3. تحديث بيانات البروفايل ---
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const currentUser = await User.findById(userId);
    if (!currentUser)
      return res.status(404).json({ message: "المستخدم غير موجود" });

    const updates = {
      gameId: req.body.gameId,
      highestRank: req.body.highestRank,
      status: req.body.status,
      isActive: req.body.isActive,
      primaryLane: req.body.primaryLane,
      secondaryLane: req.body.secondaryLane,
    };

    if (req.body.username !== undefined) {
      const trimmed = String(req.body.username).trim();
      if (!trimmed)
        return res.status(400).json({ message: "اسم المستخدم مطلوب" });

      if (trimmed !== currentUser.username) {
        if (!canChangeUsername(currentUser)) {
          const days = daysUntilUsernameChange(currentUser);
          return res.status(400).json({
            message: `يمكنك تغيير الاسم مرة واحدة كل شهر. انتظر ${days} يوماً.`,
            code: "USERNAME_COOLDOWN",
            daysRemaining: days,
          });
        }
        const taken = await User.findOne({
          username: trimmed,
          _id: { $ne: userId },
        });
        if (taken)
          return res
            .status(400)
            .json({ message: "اسم المستخدم مستخدم مسبقاً" });
        updates.username = trimmed;
        updates.lastUsernameChangeAt = new Date();
      }
    }

    Object.keys(updates).forEach(
      (key) => updates[key] === undefined && delete updates[key],
    );
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { returnDocument: "after" },
    ).select("-password");
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Update failed", error: error.message });
  }
};

// --- 4. جلب جميع الفرق ---
exports.getAllTeams = async (req, res) => {
  try {
    const teams = await Team.find({ isTemporary: false })
      .sort({ points: -1 })
      .limit(20)
      .populate({
        path: "members",
        select:
          "username status isActive isOnline highestRank primaryLane secondaryLane trainingPoints qualificationPoints",
        options: { sort: { trainingPoints: -1 } },
      });
    res.status(200).json(teams || []);
  } catch (e) {
    res.status(500).json({ message: "حدث خطأ في جلب بيانات السكوادات" });
  }
};

// --- 5. جلب فريقي ---
exports.getMyTeam = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const currentUser = await User.findById(userId).select(
      "teamId teamName isLeader",
    );
    const teamFilters = [
      { leader: userId },
      { members: userId },
      { coLeaders: userId },
    ];
    if (currentUser?.teamId) teamFilters.push({ _id: currentUser.teamId });

    let team = await Team.findOne({ $or: teamFilters })
      .populate({
        path: "members",
        select:
          "username highestRank status isActive isOnline primaryLane secondaryLane trainingPoints qualificationPoints role avatar isLeader",
        options: { sort: { trainingPoints: -1 } },
      })
      .populate("requests", "username highestRank primaryLane gameId")
      .populate("leader", "username");

    if (
      !team &&
      currentUser?.isLeader &&
      currentUser?.teamName !== "Solo Player"
    ) {
      team = await Team.findOneAndUpdate(
        { $or: [{ leader: userId }, { name: currentUser.teamName }] },
        {
          $setOnInsert: {
            name: currentUser.teamName,
            leader: userId,
            announcement: "أهلاً بكم في الفريق!",
          },
          $addToSet: { members: userId },
        },
        { upsert: true, new: true },
      )
        .populate({
          path: "members",
          select:
            "username highestRank status isActive isOnline primaryLane secondaryLane trainingPoints qualificationPoints role avatar isLeader",
          options: { sort: { trainingPoints: -1 } },
        })
        .populate("requests", "username highestRank primaryLane gameId")
        .populate("leader", "username");

      await User.findByIdAndUpdate(userId, { $set: { teamId: team._id } });
    }

    if (team) {
      const isMember = team.members?.some(
        (m) => m?._id?.toString() === userId.toString(),
      );
      if (!isMember)
        await Team.updateOne(
          { _id: team._id },
          { $addToSet: { members: userId } },
        );
    }

    if (!team) return res.json(null);
    const teamPayload = team.toObject();
    if (!teamPayload.activeTournamentId) {
      const active = await Tournament.findOne({
        squadId: team._id,
        status: "active",
        mode: { $in: ["training", "qualification", "qualifying"] },
      })
        .select("_id mode")
        .sort({ createdAt: -1 })
        .lean();
      if (active) {
        teamPayload.activeTournamentId = active._id;
        teamPayload.activeTournamentMode = active.mode;
      }
    }
    res.json(teamPayload);
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

// --- 6. الإعلانات ---
exports.getLatestAnnouncement = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const team = await Team.findOne({ members: userId });
    if (!team) return res.json(null);
    const announcement = await Announcement.findOne({ teamId: team._id })
      .sort({ createdAt: -1 })
      .populate("authorId", "username");
    res.json(announcement);
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

exports.updateTeamAnnouncement = async (req, res) => {
  try {
    const { message, type } = req.body;
    const userId = req.user.id || req.user._id;
    const team = await Team.findOneAndUpdate(
      { $or: [{ leader: userId }, { coLeaders: userId }] },
      { $set: { announcement: message } },
      { returnDocument: "after" },
    );
    if (!team) return res.status(403).json({ message: "غير مصرح" });
    await Announcement.create({
      teamId: team._id,
      authorId: userId,
      message,
      type: type || "General",
    });
    res.status(200).json({ message: "تم النشر" });
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

// --- 7. إدارة الأعضاء والطلبات ---
exports.kickMember = async (req, res) => {
  try {
    const { memberId } = req.body;
    const team = await Team.findOneAndUpdate(
      { leader: req.user.id || req.user._id },
      { $pull: { members: memberId, coLeaders: memberId } },
      { returnDocument: "after" },
    );
    if (!team) return res.status(403).json({ message: "صلاحية القائد فقط" });
    await User.findByIdAndUpdate(memberId, {
      teamName: "Solo Player",
      teamId: null,
      isLeader: false,
    });
    res.status(200).json({ message: "تم الطرد" });
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

exports.promoteMember = async (req, res) => {
  try {
    const { memberId } = req.body;
    const userId = req.user.id || req.user._id;
    const team = await Team.findOne({ leader: userId });
    if (!team) return res.status(403).json({ message: "صلاحية القائد فقط" });
    const isAlreadyCo = team.coLeaders.some((id) => id.toString() === memberId);
    await Team.updateOne(
      { _id: team._id },
      isAlreadyCo
        ? { $pull: { coLeaders: memberId } }
        : { $addToSet: { coLeaders: memberId } },
    );
    res
      .status(200)
      .json({ message: isAlreadyCo ? "تم تنزيل الرتبة" : "تمت الترقية" });
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

exports.disbandTeam = async (req, res) => {
  try {
    const team = await Team.findOneAndDelete({
      leader: req.user.id || req.user._id,
    });
    if (!team) return res.status(403).json({ message: "للقائد فقط" });
    await User.updateMany(
      { _id: { $in: team.members } },
      { teamName: "Solo Player", teamId: null, isLeader: false },
    );
    await Announcement.deleteMany({ teamId: team._id });
    res.json({ message: "تم حذف الفريق" });
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

exports.leaveTeam = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const team = await Team.findOne({ members: userId });
    if (!team || team.leader.toString() === userId)
      return res.status(400).json({ message: "لا يمكن المغادرة" });
    await Team.updateOne(
      { _id: team._id },
      { $pull: { members: userId, coLeaders: userId } },
    );
    await User.findByIdAndUpdate(userId, {
      teamName: "Solo Player",
      teamId: null,
    });
    res.json({ message: "تمت المغادرة" });
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

exports.sendJoinRequest = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const currentUser = await User.findById(userId);
    if (currentUser.teamName !== "Solo Player")
      return res.status(400).json({ message: "أنت في فريق!" });
    const team = await Team.findByIdAndUpdate(req.params.teamId, {
      $addToSet: { requests: userId },
    });
    if (!team) return res.status(404).json({ message: "غير موجود" });
    res.status(200).json({ message: "تم الطلب" });
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

exports.respondToRequest = async (req, res) => {
  try {
    const { userId, action } = req.body;
    const currentId = req.user.id || req.user._id;
    const team = await Team.findOne({
      $or: [{ leader: currentId }, { coLeaders: currentId }],
    });
    if (!team) return res.status(403).json({ message: "غير مصرح" });
    await Team.updateOne({ _id: team._id }, { $pull: { requests: userId } });
    if (action === "accept") {
      await Team.updateOne(
        { _id: team._id },
        { $addToSet: { members: userId } },
      );
      await User.findByIdAndUpdate(userId, {
        teamName: team.name,
        teamId: team._id,
      });
    }
    res.json({ message: "Success" });
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

exports.getTeamRequests = async (req, res) => {
  try {
    const currentId = req.user.id || req.user._id;
    const team = await Team.findOne({
      $or: [{ leader: currentId }, { coLeaders: currentId }],
    }).populate("requests", "username highestRank primaryLane gameId");
    res.json(team ? team.requests : []);
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

exports.getTeamNotifications = async (req, res) => {
  try {
    const team = await Team.findOne({ members: req.user.id || req.user._id });
    if (!team) return res.status(404).json({ message: "لا يوجد فريق" });
    const notifications = await Announcement.find({ teamId: team._id })
      .sort({ createdAt: -1 })
      .populate("authorId", "username");
    res.json(notifications);
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

// --- 8. البوتات ---
exports.generateBots = async (req, res) => {
  try {
    const team = await Team.findOne({ leader: req.user.id || req.user._id });
    if (!team) return res.status(404).json({ message: "للقادة فقط" });
    const ranks = ["Mythic Glory", "Mythic", "Legend", "Epic"];
    const lanes = ["Jungle", "Mid Lane", "Gold Lane", "Exp Lane", "Roaming"];
    const bots = Array.from({ length: 9 }).map((_, i) => ({
      username: `Bot_${Math.floor(Math.random() * 9999)}`,
      highestRank: ranks[Math.floor(Math.random() * ranks.length)],
      primaryLane: lanes[i % lanes.length],
      secondaryLane: lanes[(i + 1) % lanes.length],
      isBot: true,
      isActive: true,
      isOnline: true,
      teamName: team.name,
      teamId: team._id,
      gameId: `MLBB-${Math.floor(100000 + Math.random() * 900000)}`,
      status: "Active",
      trainingPoints: 0,
      qualificationPoints: 0,
    }));
    const savedBots = await User.insertMany(bots);
    await Team.updateOne(
      { _id: team._id },
      { $push: { members: { $each: savedBots.map((b) => b._id) } } },
    );
    res.status(200).json({ message: "Bots added! ⚔️" });
  } catch (e) {
    res.status(500).json({ message: "Error", detail: e.message });
  }
};

// --- 9. تصفير النقاط (Reset Points) ---
exports.resetMembersPoints = async (req, res) => {
  try {
    const currentId = req.user.id || req.user._id;

    // العثور على الفريق الذي يكون فيه المستخدم قائداً أو مساعداً
    const team = await Team.findOne({
      $or: [{ leader: currentId }, { coLeaders: currentId }],
    });

    if (!team) {
      return res
        .status(403)
        .json({
          error: "غير مصرح لك بتصفير النقاط أو لم يتم العثور على فريقك",
        });
    }

    // تحديث نقاط جميع الأعضاء المنتمين لهذا الفريق إلى صفر
    await User.updateMany(
      { teamId: team._id },
      { $set: { trainingPoints: 0 } },
    );

    res
      .status(200)
      .json({ message: "تم تصفير جميع نقاط أعضاء الفريق بنجاح 🛡️" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "حدث خطأ أثناء تصفير النقاط", detail: error.message });
  }
};
