const express = require("express"); 
const router = express.Router();
const { registerbyPhoneOTP , verifyPhoneOTP,setProfile ,resendPhoneOTP,loginSendOTP,loginVerifyOTP} = require("../contorller/auth");
const { protect , authorize} = require("../../middelware/authMiddelware");

router.post("/send-phone-otp", registerbyPhoneOTP );
router.post("/verify-phone-otp", verifyPhoneOTP);
router.post('/setprofile',protect,authorize('client'),setProfile);
router.post('/resend-otp',resendPhoneOTP);
router.post('/loginbyphone',loginSendOTP)
router.post('/login-verify-otp',loginVerifyOTP)
module.exports = router;
