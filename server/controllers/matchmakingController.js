const Team = require("../models/Team");

const rankWeights = {
  "mythic glory": 100,
  mythic: 80,
  legend: 60,
  epic: 40,
  grandmaster: 20,
};

const allLanes = ["Jungle", "Mid Lane", "Gold Lane", "Exp Lane", "Roaming"];

exports.balanceTeams = async (req, res) => {
  try {
    const { members } = req.body;

    if (!members || !Array.isArray(members)) {
      return res.status(400).json({ message: "بيانات الأعضاء غير صالحة" });
    }

    let activePlayers = members.filter((p) => p.isActive === true);
    const totalTeamsCount = Math.floor(activePlayers.length / 5);

    if (totalTeamsCount === 0) {
      return res.status(400).json({
        message: `العدد غير كافٍ. الجاهزون: ${activePlayers.length}، نحتاج 5 على الأقل.`,
      });
    }

    const pools = {
      Jungle: [],
      "Mid Lane": [],
      "Gold Lane": [],
      "Exp Lane": [],
      Roaming: [],
    };

    activePlayers.forEach((p) => {
      const playerData = {
        id: p._id || p.id,
        username: p.username,
        primaryLane: p.primaryLane,
        secondaryLane: p.secondaryLane,
        rankPower: rankWeights[(p.highestRank || "").toLowerCase()] || 10,
        assignType: "Primary",
      };

      if (pools[playerData.primaryLane]) {
        pools[playerData.primaryLane].push(playerData);
      } else {
        const smallestLane = allLanes.reduce((a, b) =>
          pools[a].length <= pools[b].length ? a : b,
        );
        pools[smallestLane].push(playerData);
      }
    });

    for (let lane of allLanes) {
      while (pools[lane].length < totalTeamsCount) {
        let foundFromSecondary = false;

        for (let otherLane of allLanes) {
          if (otherLane === lane || pools[otherLane].length <= totalTeamsCount)
            continue;

          const pIdx = pools[otherLane].findIndex(
            (p) => p.secondaryLane === lane,
          );
          if (pIdx !== -1) {
            const player = pools[otherLane].splice(pIdx, 1)[0];
            player.assignType = "Secondary";
            pools[lane].push(player);
            foundFromSecondary = true;
            break;
          }
        }

        if (!foundFromSecondary) {
          const sourceLane = allLanes.find(
            (l) => pools[l].length > totalTeamsCount,
          );
          if (sourceLane) {
            const player = pools[sourceLane].shift();
            player.assignType = "Autofill";
            pools[lane].push(player);
          } else {
            break;
          }
        }
      }
    }

    allLanes.forEach((lane) => {
      pools[lane].sort((a, b) => b.rankPower - a.rankPower);
    });

    let finalTeams = Array.from({ length: totalTeamsCount }, (_, i) => ({
      id: i + 1,
      name: `فريق ${i + 1}`,
      players: [],
      totalPower: 0,
    }));

    allLanes.forEach((lane) => {
      for (let i = 0; i < totalTeamsCount; i++) {
        const player = pools[lane][i];
        if (player) {
          finalTeams[i].players.push({
            id: player.id,
            username: player.username,
            assignedLane: lane,
            assignType: player.assignType,
            rankPower: player.rankPower,
          });
          finalTeams[i].totalPower += player.rankPower;
        }
      }
    });

    const unassigned = allLanes.flatMap((lane) =>
      pools[lane].slice(totalTeamsCount),
    );

    res.status(200).json({
      success: true,
      teams: finalTeams,
      unassigned,
    });
  } catch (error) {
    console.error("Matchmaking Error:", error);
    res
      .status(500)
      .json({ message: "حدث خطأ أثناء التوزيع", error: error.message });
  }
};

exports.saveBalancedTeams = async (req, res) => {
  try {
    const { teams } = req.body;
    const userId = req.user.id || req.user._id;

    if (!teams || !Array.isArray(teams)) {
      return res.status(400).json({ message: "لا توجد فرق لحفظها" });
    }

    const squad = await Team.findOne({
      $or: [{ leader: userId }, { coLeaders: userId }, { members: userId }],
    });

    if (!squad) return res.status(404).json({ message: "السكواد غير موجود" });

    const isManager =
      String(squad.leader) === String(userId) ||
      (squad.coLeaders || []).some(
        (cl) => String(cl._id || cl) === String(userId),
      );

    if (!isManager)
      return res.status(403).json({ message: "صلاحية غير كافية" });

    squad.eliteTeams = teams.map((team, idx) => ({
      name: team.name || `فريق ${idx + 1}`,
      players: team.players.map((p) => ({
        user: p.id,
        username: p.username,
        assignedLane: p.assignedLane,
        assignType: p.assignType,
      })),
    }));

    squad.balancedTeamsGeneratedAt = new Date();
    await squad.save();

    res.status(200).json({ success: true, eliteTeams: squad.eliteTeams });
  } catch (error) {
    res.status(500).json({ message: "فشل الحفظ", error: error.message });
  }
};
