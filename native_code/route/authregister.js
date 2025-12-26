const express = require("express"); 
const router = express.Router();
const { registerbyPhoneOTP , verifyPhoneOTP,setProfile ,resendPhoneOTP,loginSendOTP,loginVerifyOTP} = require("../contorller/auth");
const { protect , authorize} = require("../../middelware/authMiddelware");

router.post("/sendotp", registerbyPhoneOTP );
router.post("/verifyotp", verifyPhoneOTP);
router.post('/setprofile',protect,authorize('client'),setProfile);
router.post('/resend-otp',resendPhoneOTP);

module.exports = router;
