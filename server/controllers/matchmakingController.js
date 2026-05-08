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

    // 1. الفلترة الصارمة: فقط اللاعب الجاهز (isActive) يدخل القرعة
    let activePlayers = members.filter((p) => p.isActive === true);

    if (activePlayers.length < 5) {
      return res.status(400).json({
        message: `العدد غير كافٍ. الجاهزون الآن: ${activePlayers.length}، نحتاج 5 على الأقل.`,
      });
    }

    // تجهيز البيانات وترتيبها حسب القوة
    let processedPlayers = activePlayers
      .map((p) => {
        // تأكد من مطابقة اسم الرتبة مع القاموس (تحويل لـ Lowercase)
        const rankKey = (p.highestRank || "").toLowerCase();
        return {
          id: p._id || p.id,
          username: p.username,
          primaryLane: p.primaryLane,
          secondaryLane: p.secondaryLane,
          rankPower: rankWeights[rankKey] || 10,
          isHuman: !p.isBot,
        };
      })
      .sort((a, b) => b.rankPower - a.rankPower);

    // 2. توزيع اللاعبين في سلال الأدوار (Buckets)
    const buckets = {
      Jungle: [],
      "Mid Lane": [],
      "Gold Lane": [],
      "Exp Lane": [],
      Roaming: [],
    };
    const waitingPool = [];

    processedPlayers.forEach((p) => {
      if (buckets[p.primaryLane]) {
        buckets[p.primaryLane].push(p);
      } else {
        waitingPool.push(p);
      }
    });

    const totalTeamsCount = Math.floor(processedPlayers.length / 5);

    let finalTeams = Array.from({ length: totalTeamsCount }, (_, i) => ({
      id: i + 1,
      players: [],
      filledLanes: [],
      totalPower: 0,
    }));

    // --- المرحلة الأولى: توزيع الأدوار الأساسية (Primary) مع موازنة القوة ---
    allLanes.forEach((lane) => {
      // موازنة: إعطاء الفريق الأضعف حالياً الأولوية في اختيار اللاعب القادم من السلة
      finalTeams.sort((a, b) => a.totalPower - b.totalPower);

      finalTeams.forEach((team) => {
        if (buckets[lane].length > 0) {
          const player = buckets[lane].shift();
          addPlayerToTeam(player, lane, team, "Primary");
        }
      });
    });

    // --- المرحلة الثانية: استخدام الأدوار الثانوية (Secondary) لسد النقص ---
    finalTeams.forEach((team) => {
      allLanes.forEach((lane) => {
        if (!team.filledLanes.includes(lane)) {
          for (let sourceLane of allLanes) {
            const pIdx = buckets[sourceLane].findIndex(
              (p) => p.secondaryLane === lane,
            );
            if (pIdx !== -1) {
              const player = buckets[sourceLane].splice(pIdx, 1)[0];
              addPlayerToTeam(player, lane, team, "Secondary");
              break;
            }
          }
        }
      });
    });

    // --- المرحلة الثالثة: الملء التلقائي (Autofill) ---
    const remainingPlayers = [...waitingPool, ...Object.values(buckets).flat()];

    finalTeams.forEach((team) => {
      allLanes.forEach((lane) => {
        if (!team.filledLanes.includes(lane) && remainingPlayers.length > 0) {
          const player = remainingPlayers.shift();
          addPlayerToTeam(player, lane, team, "Autofill");
        }
      });
    });

    res.status(200).json({
      success: true,
      teams: finalTeams,
      unassigned: remainingPlayers, // هؤلاء اللاعبون الفائضون (إذا كان العدد ليس مضاعفات 5)
    });
  } catch (error) {
    console.error("Matchmaking Error:", error);
    res
      .status(500)
      .json({ message: "حدث خطأ أثناء توزيع الفرق", error: error.message });
  }
};

function addPlayerToTeam(player, lane, team, type) {
  team.players.push({ ...player, assignedLane: lane, assignType: type });
  team.filledLanes.push(lane);
  team.totalPower += player.rankPower;
}
