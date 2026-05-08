const Tournament = require("../models/Tournament");
const User = require("../models/User");
const Team = require("../models/Team");

/**
 * 1. جلب البطولة الحالية
 */
exports.getCurrentTournament = async (req, res) => {
  try {
    const currentUserId = req.user._id || req.user.id;
    const squadId = req.user.teamId || currentUserId;

    const tournament = await Tournament.findOne({
      $or: [
        { squadId, status: "active" },
        { mode: "qualifying", status: "active" },
      ],
    })
      .populate("teams")
      .populate("rounds.matches.teamA rounds.matches.teamB")
      .populate("leagueMatches.teamA leagueMatches.teamB");

    if (!tournament) {
      return res.status(404).json({ message: "لا توجد بطولة نشطة حالياً" });
    }
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * 2. جلب بطولة محددة بالـ ID
 */
exports.getTournamentById = async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate("teams")
      .populate("rounds.matches.teamA rounds.matches.teamB")
      .populate("leagueMatches.teamA leagueMatches.teamB");

    if (!tournament)
      return res.status(404).json({ error: "البطولة غير موجودة" });
    res.json(tournament);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * 3. إنشاء بطولة جديدة
 */
exports.createTournament = async (req, res) => {
  try {
    const { mode, teams: incomingTeams } = req.body;
    if (!req.user) return res.status(401).json({ error: "غير مصرح لك" });

    const currentUserId = req.user._id || req.user.id;
    const squadId = req.user.teamId || currentUserId;

    const finalTeamIds = [];
    for (let teamData of incomingTeams) {
      if (!teamData._id || String(teamData._id).startsWith("temp")) {
        const uniqueName = `${teamData.name || "فريق مؤقت"} - ${Date.now()}`;
        const newTeam = new Team({
          name: uniqueName,
          members: teamData.players.map((p) => p._id || p.id),
          leader: currentUserId,
          isTemporary: true,
        });
        const savedTeam = await newTeam.save();
        finalTeamIds.push(savedTeam._id);
      } else {
        finalTeamIds.push(teamData._id);
      }
    }

    let systemType = finalTeamIds.length % 2 === 0 ? "bracket" : "league";
    let rounds = [];
    let leagueMatches = [];
    let leaguePoints = new Map();

    if (systemType === "bracket") {
      let firstRoundMatches = [];
      for (let i = 0; i < finalTeamIds.length; i += 2) {
        firstRoundMatches.push({
          teamA: finalTeamIds[i],
          teamB: finalTeamIds[i + 1],
          winner: null,
        });
      }
      rounds.push({ roundNumber: 1, matches: firstRoundMatches });
    } else {
      finalTeamIds.forEach((id) => leaguePoints.set(id.toString(), 0));
      for (let i = 0; i < finalTeamIds.length; i++) {
        for (let j = i + 1; j < finalTeamIds.length; j++) {
          leagueMatches.push({
            teamA: finalTeamIds[i],
            teamB: finalTeamIds[j],
            winner: null,
          });
        }
      }
    }

    const newTournament = new Tournament({
      squadId,
      mode,
      systemType,
      teams: finalTeamIds,
      rounds,
      leaguePoints,
      leagueMatches,
      status: "active",
    });

    await newTournament.save();
    const populated = await Tournament.findById(newTournament._id)
      .populate("teams")
      .populate("rounds.matches.teamA rounds.matches.teamB")
      .populate("leagueMatches.teamA leagueMatches.teamB");

    if (global.io) global.io.emit("tournamentUpdated", populated);
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * 4. تسجيل فوز في مباراة
 */
exports.reportWin = async (req, res) => {
  const { tournamentId, winnerTeamId, matchIdx, roundIdx } = req.body;
  try {
    let tournament = await Tournament.findById(tournamentId);
    if (!tournament)
      return res.status(404).json({ error: "البطولة غير موجودة" });

    const cleanWinnerId = winnerTeamId.toString();

    if (tournament.systemType === "league") {
      tournament.leagueMatches[matchIdx].winner = cleanWinnerId;
      const currentPoints = tournament.leaguePoints.get(cleanWinnerId) || 0;
      tournament.leaguePoints.set(cleanWinnerId, currentPoints + 3);

      if (tournament.leagueMatches.every((m) => m.winner)) {
        const hasTie = await finishTournamentLogic(tournament);
        if (hasTie) {
          await tournament.save();
          const updated = await Tournament.findById(tournament._id)
            .populate("teams")
            .populate("leagueMatches.teamA leagueMatches.teamB");
          if (global.io) global.io.emit("tournamentUpdated", updated);
          return res.json({ ...updated.toObject(), message: "TIE_DETECTED" });
        }
      }
    } else {
      tournament.rounds[roundIdx].matches[matchIdx].winner = cleanWinnerId;
      tournament.markModified(`rounds.${roundIdx}.matches.${matchIdx}.winner`);

      if (tournament.rounds[roundIdx].matches.every((m) => m.winner)) {
        const winners = tournament.rounds[roundIdx].matches.map((m) =>
          m.winner.toString(),
        );

        if (winners.length === 1) {
          await finishTournamentLogic(tournament);
        } else {
          let nextMatches = [];
          for (let i = 0; i < winners.length; i += 2) {
            if (winners[i + 1]) {
              nextMatches.push({
                teamA: winners[i],
                teamB: winners[i + 1],
                winner: null,
              });
            } else {
              nextMatches.push({
                teamA: winners[i],
                teamB: null,
                winner: winners[i],
              });
            }
          }
          tournament.rounds.push({
            roundNumber: tournament.rounds.length + 1,
            matches: nextMatches,
          });
          tournament.markModified("rounds");
        }
      }
    }

    tournament.markModified("leaguePoints");
    await tournament.save();

    const updated = await Tournament.findById(tournament._id)
      .populate("teams")
      .populate("rounds.matches.teamA rounds.matches.teamB")
      .populate("leagueMatches.teamA leagueMatches.teamB");

    if (global.io) global.io.emit("tournamentUpdated", updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * 5. التراجع عن نتيجة (Undo)
 */
exports.undoMatch = async (req, res) => {
  const { tournamentId } = req.body;
  try {
    let tournament = await Tournament.findById(tournamentId);
    if (!tournament)
      return res.status(404).json({ error: "البطولة غير موجودة" });

    if (tournament.systemType === "league") {
      const matches = tournament.leagueMatches;
      for (let i = matches.length - 1; i >= 0; i--) {
        if (matches[i].winner) {
          const winnerId = matches[i].winner.toString();
          const currentPoints = tournament.leaguePoints.get(winnerId) || 0;
          tournament.leaguePoints.set(winnerId, Math.max(0, currentPoints - 3));
          matches[i].winner = null;
          tournament.markModified("leagueMatches");
          tournament.markModified("leaguePoints");
          break;
        }
      }
    } else {
      let found = false;
      for (let r = tournament.rounds.length - 1; r >= 0; r--) {
        const matches = tournament.rounds[r].matches;
        for (let m = matches.length - 1; m >= 0; m--) {
          if (matches[m].winner) {
            matches[m].winner = null;
            if (tournament.rounds.length > r + 1)
              tournament.rounds.splice(r + 1);
            tournament.markModified("rounds");
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    tournament.status = "active";
    tournament.finalWinner = null;
    await tournament.save();

    const updated = await Tournament.findById(tournament._id)
      .populate("teams")
      .populate(
        "rounds.matches.teamA rounds.matches.teamB rounds.matches.winner",
      )
      .populate("leagueMatches.teamA leagueMatches.teamB leagueMatches.winner");

    if (global.io) global.io.emit("tournamentUpdated", updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * 6. توليد مباريات كسر التعادل
 */
exports.generateTieBreaker = async (req, res) => {
  const { tournamentId } = req.body;
  try {
    let tournament = await Tournament.findById(tournamentId);
    if (!tournament)
      return res.status(404).json({ error: "البطولة غير موجودة" });

    const pointsMap = tournament.leaguePoints;
    let maxPoints = -1;
    let tiedTeamIds = [];

    for (let [teamId, points] of pointsMap.entries()) {
      if (points > maxPoints) {
        maxPoints = points;
        tiedTeamIds = [teamId];
      } else if (points === maxPoints && maxPoints > 0) {
        tiedTeamIds.push(teamId);
      }
    }

    if (tiedTeamIds.length < 2) {
      return res
        .status(400)
        .json({ error: "لا يوجد تعادل حالياً يتطلب مباراة فاصلة" });
    }

    let matchesToAdd = tiedTeamIds.flatMap((id, i) =>
      tiedTeamIds.slice(i + 1).map((nextId) => ({
        teamA: id,
        teamB: nextId,
        winner: null,
        isTieBreaker: true,
      })),
    );

    tournament.leagueMatches.push(...matchesToAdd);
    tournament.status = "active";
    tournament.markModified("leagueMatches");
    await tournament.save();

    const updated = await Tournament.findById(tournament._id)
      .populate("teams")
      .populate("leagueMatches.teamA leagueMatches.teamB");

    if (global.io) global.io.emit("tournamentUpdated", updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "فشل إنشاء الفاصلة: " + err.message });
  }
};

/**
 * دالة المنطق النهائية لإنهاء البطولة وتحديث النقاط
 */
async function finishTournamentLogic(tournament) {
  try {
    const toIdString = (value) => {
      if (!value) return null;
      if (typeof value === "string") return value;
      if (value._id) return value._id.toString();
      return value.toString ? value.toString() : null;
    };

    let winnerTeamId;

    if (tournament.systemType === "league") {
      const sorted = [...tournament.leaguePoints.entries()].sort(
        (a, b) => b[1] - a[1],
      );
      if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return true; // تعادل
      winnerTeamId = sorted[0][0];
    } else {
      const lastRound = tournament.rounds[tournament.rounds.length - 1];
      winnerTeamId = lastRound.matches[0].winner;
    }

    if (!winnerTeamId) return false;

    tournament.finalWinner = winnerTeamId;
    tournament.status = "finished";

    // ✅ تصحيح 1: استخدام members (الموجود في Schema) بدلاً من players
    let winnerTeamData = await Team.findById(winnerTeamId).populate("members");
    const isRealTeam = !winnerTeamId.toString().startsWith("temp-");
    const mode = tournament.mode?.toLowerCase() || "";

    // ✅ تصحيح 2: تحديد الحقل الصحيح في مودل User بناءً على نوع البطولة
    let userPointField = "trainingPoints"; // الافتراضي للسكوادات
    if (mode === "qualifying" || mode === "qualification") {
      userPointField = "qualificationPoints";

      if (isRealTeam) {
        await Team.findByIdAndUpdate(winnerTeamId, {
          $inc: { points: 1 },
          $set: { isQualified: true },
        });

        const losingTeams = tournament.teams
          .filter(
            (t) =>
              !toIdString(t).startsWith("temp-") &&
              toIdString(t) !== winnerTeamId.toString(),
          )
          .map((t) => toIdString(t));

        await Team.updateMany(
          { _id: { $in: losingTeams } },
          { $set: { isQualified: false } },
        );
      }
    }

    // ✅ تصحيح 3: تحديث نقاط المستخدمين باستخدام الحقل الديناميكي المستنتج
    const playerIds = (winnerTeamData?.members || []).map((p) =>
      p._id ? p._id : p,
    );

    if (playerIds.length > 0) {
      console.log(
        `🏆 [POINTS] تحديث ${userPointField} لعدد ${playerIds.length} لاعبين.`,
      );
      await User.updateMany(
        { _id: { $in: playerIds } },
        { $inc: { [userPointField]: 3 } },
      );
    }

    await tournament.save();

    if (global.io) {
      console.log(
        `🏆 انتهت البطولة. الفائز: ${winnerTeamId}. إرسال التحديثات...`,
      );
      setTimeout(async () => {
        global.io.emit("pointsUpdated");
        try {
          const populated = await Tournament.findById(tournament._id)
            .populate("teams")
            .populate("rounds.matches.teamA rounds.matches.teamB")
            .populate("leagueMatches.teamA leagueMatches.teamB");
          global.io.emit("tournamentUpdated", populated);
        } catch (e) {
          console.error("خطأ في Populate التحديث النهائي:", e.message);
        }
      }, 500);
    }

    return false;
  } catch (err) {
    console.error("❌ خطأ في إنهاء البطولة:", err.message);
    return false;
  }
}
