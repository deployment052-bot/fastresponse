const express = require("express");
const { protect , authorize } = require("../middelware/authMiddelware");
const router = express.Router();
const {

  getTechnicianWorkForAdmin,getAllTechniciansForAdmin,getAllClientForAdmin,getclientWorkForAdmin,getAllWorkAdmin,resolveWorkIssue
} = require("../controllers/admincontrooler");
// const { getAllTechnicianWorks } = require("../controllers/techniciancontroller");

router.post('/issue-resolve',resolveWorkIssue)
router.post('/get-technician',protect,authorize('admin'),getTechnicianWorkForAdmin)
router.get('/gettechnican',protect,authorize('admin'),getAllTechniciansForAdmin );
router.get('/getclient',protect,authorize('admin'),getAllClientForAdmin);
router.post('/getclientwork',protect,authorize('admin'),getclientWorkForAdmin);
router.get('/getAllWorkadmin',protect,authorize('admin'),getAllWorkAdmin)
module.exports = router;
