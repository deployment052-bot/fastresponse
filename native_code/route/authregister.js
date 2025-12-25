const express = require("express"); 
const router = express.Router();
const { sendPhoneOTP, verifyPhoneOTP,setProfile } = require("../contorller/auth");
const { protect , authorize} = require("../../middelware/authMiddelware");

router.post("/send-phone-otp", sendPhoneOTP);
router.post("/verify-phone-otp", verifyPhoneOTP);
router.post('/setprofile',protect,authorize('client'),setProfile);
module.exports = router;