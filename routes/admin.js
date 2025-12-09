const express = require("express");
const { protect , authorize } = require("../middelware/authMiddelware");
const router = express.Router();
const {

  getTechnicianWorkForAdmin,getAllTechniciansForAdmin,getAllClientForAdmin,getclientWorkForAdmin,getAllWorkAdmin,resolveWorkIssue,getOpenIssues,getAllIssues,getPartsPendingRequests,updatePartStatus,getAllPartsRequests,getNeedPartsByWorkId
} = require("../controllers/admincontrooler");
// const { getAllTechnicianWorks } = require("../controllers/techniciancontroller");

router.post('/issue-resolve',resolveWorkIssue) // hit the resolve
router.post('/get-technician',protect,authorize('admin'),getTechnicianWorkForAdmin)
router.get('/gettechnican',protect,authorize('admin'),getAllTechniciansForAdmin );
router.get('/getclient',protect,authorize('admin'),getAllClientForAdmin);
router.post('/getclientwork',protect,authorize('admin'),getclientWorkForAdmin);
router.get('/getAllWorkadmin',protect,authorize('admin'),getAllWorkAdmin)

router.get('/getnewissue',protect,authorize('admin'),getOpenIssues)// ye wala route jb tk koi issue open h wo data dega

router.get('/getallissue',protect,authorize('admin'),getAllIssues)// ye wala all route ko dikhayega 


//after this every route is for to the making the matairial 
router.get('/getneedpartsrequest',protect,authorize('admin'),getPartsPendingRequests) // for to fetching the needparts issue
router.put('/approverejectbyadmin',protect,authorize('admin'),updatePartStatus) // for to make action on the needpart request
router.get('/getneedpart',protect,authorize('admin'),getAllPartsRequests)
router.get('/getneedbyid/:workId',protect,authorize('admin'),getNeedPartsByWorkId)
module.exports = router;
