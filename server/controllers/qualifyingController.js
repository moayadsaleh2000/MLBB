const Tournament = require("../models/Tournament");
const Team = require("../models/Team");

// مصفوفة عالمية في السيرفر لحفظ المعرفات (IDs) للفرق المنتظرة يدوياً
let qualifyingQueue = [];

// 1. تسجيل السكواد (Register)
exports.registerForQualifying = async (req, res) => {
  try {
    const userId = req.user._id;

    const squad = await Team.findOne({
      $or: [{ leader: userId }, { coLeaders: userId }],
    });

    if (!squad) {
      return res
        .status(403)
        .json({ error: "يجب أن تكون قائد أو مساعد في سكواد للتسجيل" });
    }

    const squadId = squad._id.toString();

    if (qualifyingQueue.includes(squadId)) {
      const currentTeams = await Team.find({
        _id: { $in: qualifyingQueue },
      }).select("name logo points isQualified");
      return res.json({
        message: "أنت مسجل بالفعل في الانتظار",
        queueCount: qualifyingQueue.length,
        teams: currentTeams,
      });
    }

    qualifyingQueue.push(squadId);

    const waitingTeams = await Team.find({
      _id: { $in: qualifyingQueue },
    }).select("name logo points isQualified");

    if (global.io) {
      global.io.emit("qualifyingQueueUpdated", {
        count: qualifyingQueue.length,
        teams: waitingTeams,
      });
    }

    res.json({
      message: "تم دخول السكواد بنجاح",
      queueCount: qualifyingQueue.length,
      teams: waitingTeams,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 2. جلب حالة الانتظار (Fetch Queue)
exports.getQueue = async (req, res) => {
  try {
    const teams = await Team.find({
      $or: [{ _id: { $in: qualifyingQueue } }, { isQualified: true }],
    }).select("name logo points isQualified");

    res.json({
      queueCount: teams.length,
      teams: teams || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 3. بدء البطولة (Start Tournament)
exports.startQualifyingTournament = async (req, res) => {
  try {
    const qualifiedTeams = await Team.find({ isQualified: true }).select("_id");
    const qualifiedIds = qualifiedTeams.map((t) => t._id.toString());

    const teamsToStart = [...new Set([...qualifyingQueue, ...qualifiedIds])];

    if (teamsToStart.length < 2) {
      return res
        .status(400)
        .json({ error: "يجب وجود سكوادين على الأقل لبدء المنافسة" });
    }

    qualifyingQueue = [];

    const systemType = teamsToStart.length % 2 === 0 ? "bracket" : "league";
    let rounds = [];
    let leagueMatches = [];
    let leaguePoints = new Map();

    if (systemType === "bracket") {
      const firstRoundMatches = [];
      for (let i = 0; i < teamsToStart.length; i += 2) {
        firstRoundMatches.push({
          teamA: teamsToStart[i],
          teamB: teamsToStart[i + 1],
          winner: null,
        });
      }
      rounds.push({ roundNumber: 1, matches: firstRoundMatches });
    } else {
      teamsToStart.forEach((id) => leaguePoints.set(id.toString(), 0));
      for (let i = 0; i < teamsToStart.length; i++) {
        for (let j = i + 1; j < teamsToStart.length; j++) {
          leagueMatches.push({
            teamA: teamsToStart[i],
            teamB: teamsToStart[j],
            winner: null,
          });
        }
      }
    }

    const newTournament = new Tournament({
      mode: "qualifying",
      systemType,
      teams: teamsToStart,
      rounds,
      leaguePoints,
      leagueMatches,
      status: "active",
    });

    await newTournament.save();

    const populated = await Tournament.findById(newTournament._id)
      .populate("teams", "name logo")
      .populate("rounds.matches.teamA rounds.matches.teamB", "name logo")
      .populate("leagueMatches.teamA leagueMatches.teamB", "name logo");

    if (global.io) global.io.emit("tournamentStarted", populated);
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 4. جلب البطولة النشطة
exports.getActiveQualifying = async (req, res) => {
  try {
    const tournament = await Tournament.findOne({
      mode: "qualifying",
      status: "active",
    })
      .populate("teams", "name logo")
      .populate("rounds.matches.teamA rounds.matches.teamB", "name logo")
      .populate("leagueMatches.teamA leagueMatches.teamB", "name logo");

    res.json(tournament || null);
  } catch (err) {
    res.status(500).json({ error: "خطأ في جلب البطولة" });
  }
};

// 5. تسجيل الفوز
exports.reportQualifyingWin = async (req, res) => {
  const { tournamentId, winnerTeamId, matchIdx, roundIdx } = req.body;
  try {
    let tournament = await Tournament.findById(tournamentId);
    if (!tournament)
      return res.status(404).json({ error: "البطولة غير موجودة" });

    const cleanWinnerId = winnerTeamId.toString();

    if (tournament.systemType === "league") {
      tournament.leagueMatches[matchIdx].winner = cleanWinnerId;
      const currentPts = tournament.leaguePoints.get(cleanWinnerId) || 0;
      tournament.leaguePoints.set(cleanWinnerId, currentPts + 3);
      tournament.markModified("leaguePoints");
      tournament.markModified("leagueMatches");
    } else {
      tournament.rounds[roundIdx].matches[matchIdx].winner = cleanWinnerId;
      tournament.markModified(`rounds.${roundIdx}.matches.${matchIdx}.winner`);
    }

    await tournament.save();

    const isFinished =
      tournament.systemType === "league"
        ? tournament.leagueMatches.every((m) => m.winner)
        : tournament.rounds[roundIdx].matches.every((m) => m.winner);

    if (isFinished) {
      await finishQualifyingLogic(tournament);
    }

    const updated = await Tournament.findById(tournament._id)
      .populate("teams", "name logo")
      .populate("rounds.matches.teamA rounds.matches.teamB", "name logo")
      .populate("leagueMatches.teamA leagueMatches.teamB", "name logo");

    if (global.io) global.io.emit("tournamentUpdated", updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 6. التراجع عن تسجيل الفوز (Undo Winner)
exports.undoQualifyingWin = async (req, res) => {
  const { tournamentId, matchIdx, roundIdx } = req.body;
  try {
    const tournament = await Tournament.findById(tournamentId);
    if (!tournament)
      return res.status(404).json({ error: "البطولة غير موجودة" });

    if (tournament.status === "finished") {
      return res
        .status(400)
        .json({ error: "لا يمكن التراجع بعد انتهاء البطولة" });
    }

    const userId = req.user._id;
    const myTeam = await Team.findOne({
      $or: [{ leader: userId }, { coLeaders: userId }],
    }).select("_id");

    if (!myTeam) {
      return res.status(403).json({ error: "صلاحية القائد أو المساعد فقط" });
    }

    const isParticipant = tournament.teams.some(
      (teamId) => teamId.toString() === myTeam._id.toString(),
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "فريقك ليس ضمن هذه التصفيات" });
    }

    if (tournament.systemType === "league") {
      const targetMatch = tournament.leagueMatches?.[matchIdx];
      if (!targetMatch)
        return res.status(400).json({ error: "المباراة غير موجودة" });
      if (!targetMatch.winner)
        return res.status(400).json({ error: "لا يوجد فائز للتراجع عنه" });

      const winnerId = targetMatch.winner.toString();
      targetMatch.winner = null;

      const currentPts = tournament.leaguePoints.get(winnerId) || 0;
      tournament.leaguePoints.set(winnerId, Math.max(0, currentPts - 3));

      tournament.markModified("leagueMatches");
      tournament.markModified("leaguePoints");
    } else {
      const targetRound = tournament.rounds?.[roundIdx];
      const targetMatch = targetRound?.matches?.[matchIdx];

      if (!targetMatch)
        return res.status(400).json({ error: "المباراة غير موجودة" });
      if (!targetMatch.winner)
        return res.status(400).json({ error: "لا يوجد فائز للتراجع عنه" });

      targetMatch.winner = null;
      tournament.markModified(`rounds.${roundIdx}.matches.${matchIdx}.winner`);
    }

    await tournament.save();

    const updated = await Tournament.findById(tournament._id)
      .populate("teams", "name logo")
      .populate("rounds.matches.teamA rounds.matches.teamB", "name logo")
      .populate("leagueMatches.teamA leagueMatches.teamB", "name logo");

    if (global.io) global.io.emit("tournamentUpdated", updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// الدالة المسؤولة عن إنهاء البطولة وتحديد المتأهل فقط
async function finishQualifyingLogic(tournament) {
  try {
    let winnerTeamId;
    if (tournament.systemType === "league") {
      const sorted = [...tournament.leaguePoints.entries()].sort(
        (a, b) => b[1] - a[1],
      );
      winnerTeamId = sorted[0][0];
    } else {
      const lastRound = tournament.rounds[tournament.rounds.length - 1];
      winnerTeamId = lastRound.matches[0].winner;
    }

    if (winnerTeamId) {
      await Team.findByIdAndUpdate(winnerTeamId, {
        $inc: { points: 1 },
        $set: { isQualified: true },
      });

      const losingTeams = tournament.teams.filter(
        (id) => id.toString() !== winnerTeamId.toString(),
      );
      await Team.updateMany(
        { _id: { $in: losingTeams } },
        { $set: { isQualified: false } },
      );
    }

    tournament.status = "finished";
    tournament.finalWinner = winnerTeamId;
    await tournament.save();
  } catch (err) {
    console.error("Error in finishing tournament:", err);
  }
}
