const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.JWT_SECRET || "MLBB_MVP_KEY_2026";

// 1. تسجيل لاعب (مع فحص حالة قفل التسجيل)
exports.joinTournament = async (models, req, res) => {
  const { Player, Settings } = models;
  try {
    // التأكد إذا كان التسجيل مغلقاً من قبل الأدمن
    const settings = await Settings.findOne();
    if (settings && settings.registration_open === false) {
      return res
        .status(403)
        .json({ message: "عذراً، أغلق الأدمن باب التسجيل حالياً!" });
    }

    const { name, rank, primaryRole, secondaryRole } = req.body;

    // منع تكرار الأسماء
    const existingPlayer = await Player.findOne({ name: name.trim() });
    if (existingPlayer) {
      return res
        .status(400)
        .json({ message: "هذا الاسم مسجل مسبقاً، اختر اسماً آخر." });
    }

    const newPlayer = await Player.create({
      name: name.trim(),
      rank,
      primaryRole,
      secondaryRole,
    });

    // إنشاء توكن للهوية
    const token = jwt.sign(
      { id: newPlayer._id, name: newPlayer.name },
      SECRET_KEY,
      { expiresIn: "1d" },
    );

    res.status(200).json({
      token,
      message: "تم التسجيل بنجاح",
      playerId: newPlayer._id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 2. التحكم في قفل وفتح التسجيل (خاص بالأدمن)
exports.toggleRegistration = async (models, req, res) => {
  const { Settings } = models;
  try {
    const s = await Settings.findOne();
    // إذا لم تكن الإعدادات موجودة ننشئها، وإلا نعكس الحالة الحالية
    const updated = await Settings.findOneAndUpdate(
      {},
      { registration_open: s ? !s.registration_open : false },
      { upsert: true, new: true },
    );
    res.json({ registration_open: updated.registration_open });
  } catch (err) {
    res.status(500).json({ error: "فشل في تغيير حالة التسجيل" });
  }
};

// 3. فحص الهوية (للتأكد من أن اللاعب ما زال موجوداً في البطولة)
exports.getMe = async (models, req, res) => {
  const { Player } = models;
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ message: "غير مصرح لك" });

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const player = await Player.findById(decoded.id);
    if (!player)
      return res.status(404).json({ message: "اللاعب غير موجود أو تم حذفه" });
    res.json(player);
  } catch (err) {
    res.status(403).json({ message: "جلسة انتهت، سجل دخول مجدداً" });
  }
};

// 4. جلب قائمة اللاعبين
exports.getAllPlayers = async (models, req, res) => {
  const { Player } = models;
  try {
    const players = await Player.find().sort({ createdAt: 1 });
    res.json(players || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 5. تقسيم الفرق (خوارزمية الرتب + توزيع الأدوار)
exports.splitTeams = async (models, req, res) => {
  const { Player } = models;
  try {
    const players = await Player.find();

    // وزن كل رتبة للموازنة بين الفرق
    const rankWeight = {
      "Mythical Immortal": 10,
      "Mythical Glory": 8,
      Mythic: 6,
      Legend: 4,
      Epic: 2,
    };

    // ترتيب اللاعبين من الأقوى للأضعف
    const sortedPlayers = players.sort(
      (a, b) => (rankWeight[b.rank] || 0) - (rankWeight[a.rank] || 0),
    );

    const numTeams = Math.floor(sortedPlayers.length / 5);
    if (numTeams === 0)
      return res.status(400).json({ message: "العدد غير كافٍ" });

    let teams = Array.from({ length: numTeams }, () => []);

    // توزيع ذكي: يحاول عدم تكرار الدور الأساسي في نفس الفريق
    sortedPlayers.forEach((player) => {
      // البحث عن فريق يحتاج هذا الدور (Role) ولم يكتمل عدده (5)
      let targetTeam = teams.find(
        (t) =>
          t.length < 5 && !t.some((p) => p.primaryRole === player.primaryRole),
      );

      // إذا تعذر إيجاد فريق بدون هذا الدور، نضعه في الفريق الأقل عدداً
      if (!targetTeam) {
        targetTeam = teams
          .filter((t) => t.length < 5)
          .sort((a, b) => a.length - b.length)[0];
      }

      if (targetTeam) targetTeam.push(player);
    });

    res.json({ teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 6. بدء عملية كشف الفرق (Reveal)
exports.startReveal = async (models, req, res) => {
  const { Settings } = models;
  try {
    await Settings.findOneAndUpdate(
      {},
      { reveal_started: true },
      { upsert: true },
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "خطأ في بدء الكشف" });
  }
};

// 7. تصفير البطولة بالكامل
exports.resetAll = async (models, req, res) => {
  const { Player, Settings } = models;
  try {
    await Player.deleteMany({});
    await Settings.findOneAndUpdate(
      {},
      {
        reveal_started: false,
        registration_open: true,
      },
    );
    res.json({ message: "تم تصفير البطولة وفتح التسجيل" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 8. جلب الإعدادات الحالية
exports.getSettings = async (models, req, res) => {
  const { Settings } = models;
  try {
    const s = await Settings.findOne();
    res.json(s || { reveal_started: false, registration_open: true });
  } catch (e) {
    res.json({ reveal_started: false, registration_open: true });
  }
};

// 9. حذف لاعب محدد (للأدمن)
exports.deletePlayer = async (models, req, res) => {
  try {
    await models.Player.findByIdAndDelete(req.params.id);
    res.json({ message: "تم حذف اللاعب بنجاح" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
