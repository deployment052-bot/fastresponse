const express = require("express");
const router = express.Router();
const { protect , authorize } = require("../middelware/authMiddelware");
const technicianController = require("../controllers/techniciancontroller");

// Technician Summary
router.get("/summary", protect,authorize('technician') ,technicianController.getAllTechnicianWorks );// abhi k liye ye wali work details 
router.get("/summary-count", protect,authorize('technician') ,technicianController.getTechnicianSummarybycount );


router.get("/summary-count-1", protect,authorize('technician') ,technicianController.getTechnicianSummary1 );// abhi k liye yw wali count

router.get("/available-jobs", protect,authorize('technician'), technicianController.getAvailableJobs);


router.post("/approve-job", protect, authorize('technician'),technicianController.approveJob);


router.post("/issueraise",technicianController.raiseWorkIssue)
router.post("/payment", protect,authorize('technician') ,technicianController.confirmPayment);
router.post('/needpartssubmit',technicianController.needPartRequest)
module.exports = router;
