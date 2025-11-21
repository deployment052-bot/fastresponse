const express = require("express");
const { protect , authorize } = require("../middelware/authMiddelware");
const router = express.Router();
const {
  getAdminNotifications,
  markNotificationSeen,
  resolveNotification,
  raiseWorkIssue,
  getTechnicianWorkForAdmin,getAllTechniciansForAdmin,getAllClientForAdmin,getclientWorkForAdmin
} = require("../controllers/admincontrooler");
// const { getAllTechnicianWorks } = require("../controllers/techniciancontroller");

router.get("/notifications", getAdminNotifications);

router.patch("/notifications/:id/seen", markNotificationSeen);

router.patch("/notifications/:id/resolve", resolveNotification);

router.post("/raise-issue", protect,authorize('admin'),raiseWorkIssue);
router.post('/get-technician',protect,authorize('admin'),getTechnicianWorkForAdmin)
router.get('/gettechnican',protect,authorize('admin'),getAllTechniciansForAdmin );
router.get('/getclient',protect,authorize('admin'),getAllClientForAdmin);
router.post('/getclientwork',protect,authorize('admin'),getclientWorkForAdmin);
module.exports = router;
