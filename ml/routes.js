const express = require("express");
const router = express.Router();
const playerController = require("./playerController");

module.exports = (db) => {
  // المسار الجديد اللي ضفناه عشان قفل وفتح التسجيل
  router.post("/toggle-reg", (req, res) =>
    playerController.toggleRegistration(db, req, res),
  );

  router.post("/join", (req, res) =>
    playerController.joinTournament(db, req, res),
  );

  router.get("/me", (req, res) => playerController.getMe(db, req, res));

  router.get("/players", (req, res) =>
    playerController.getAllPlayers(db, req, res),
  );

  router.delete("/players/:id", (req, res) =>
    playerController.deletePlayer(db, req, res),
  );

  router.post("/reset", (req, res) => playerController.resetAll(db, req, res));

  router.get("/settings", (req, res) =>
    playerController.getSettings(db, req, res),
  );

  router.get("/split-teams", (req, res) =>
    playerController.splitTeams(db, req, res),
  );

  router.post("/start-reveal", (req, res) =>
    playerController.startReveal(db, req, res),
  );

  return router;
};
