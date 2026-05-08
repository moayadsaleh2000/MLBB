const User = require("../models/User");
const Team = require("../models/Team");
const Announcement = require("../models/Announcement");
const jwt = require("jsonwebtoken");

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
        // ضمان وجود حقول النقاط للمستخدمين الجدد
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
    const updates = {
      gameId: req.body.gameId,
      highestRank: req.body.highestRank,
      status: req.body.status,
      isActive: req.body.isActive,
      primaryLane: req.body.primaryLane,
      secondaryLane: req.body.secondaryLane,
    };
    Object.keys(updates).forEach(
      (key) => updates[key] === undefined && delete updates[key],
    );
    const user = await User.findByIdAndUpdate(
      req.user.id || req.user._id,
      { $set: updates },
      { returnDocument: "after" },
    );
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Update failed", error: error.message });
  }
};

// --- 4. جلب جميع الفرق (معدلة لترتيب النقاط وجلب بيانات الأعضاء) ---
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

    if (!teams || teams.length === 0) return res.status(200).json([]);
    res.status(200).json(teams);
  } catch (e) {
    res.status(500).json({ message: "حدث خطأ في جلب بيانات السكوادات" });
  }
};

// --- 5. جلب فريقي (معدلة لضمان وصول النقاط لجدول الـ Home) ---
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
    if (currentUser?.teamId) {
      teamFilters.push({ _id: currentUser.teamId });
    }

    let team = await Team.findOne({
      $or: teamFilters,
    })
      .populate({
        path: "members",
        select:
          "username highestRank status isActive isOnline primaryLane secondaryLane trainingPoints qualificationPoints role avatar isLeader",
        options: { sort: { trainingPoints: -1 } },
      })
      .populate("requests", "username highestRank primaryLane gameId")
      .populate("leader", "username");

    // إصلاح تلقائي: إن كان قائدًا ولا يوجد فريق، أنشئ/استرجع فريقه مباشرة.
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

    // إصلاح تلقائي: إذا الفريق موجود لكن المستخدم غير موجود ضمن members أضفه.
    if (team) {
      const isMember = team.members?.some(
        (member) => member?._id?.toString() === userId.toString(),
      );
      if (!isMember) {
        await Team.updateOne(
          { _id: team._id },
          { $addToSet: { members: userId } },
        );
      }
    }

    res.json(team || null);
  } catch (e) {
    res.status(500).json({ message: "Error" });
  }
};

// --- 6. الإعلانات (Announcements) ---
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
    res.status(500).json({ message: "Error fetching announcement" });
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
      message: message,
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
      teamId: null, // تأكد من تصفير الـ ID أيضاً
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
      teamId: team._id, // ربط البوت بالفريق
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
