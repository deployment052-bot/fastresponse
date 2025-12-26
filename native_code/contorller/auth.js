const User = require("../../model/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Redis = require("ioredis");
const client = require("../../utils/twillio");

const redis = new Redis(process.env.REDIS_URL);



const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
};

const normalizePhone = (phone) => {
  phone = phone.trim();
  if (!phone.startsWith("+")) {
    phone = "+91" + phone;
  }
  return phone;
};

const safeUserResponse = (user) => ({
  _id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  email: user.email,
  role: user.role,
  location: user.location,
  isProfileCompleted: user.isProfileCompleted,
});



exports.registerbyPhoneOTP = async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone)
      return res.status(400).json({ success: false, message: "Phone required" });

    phone = normalizePhone(phone);

    let user = await User.findOne({ phone });

    if (!user) {
      user = new User({
        phone,
        role: "client",
        isTemp: true,
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    user.phoneOTP = await bcrypt.hash(otp, 10);
    user.phoneOTPExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    if (process.env.NODE_ENV !== "development") {
      await client.messages.create({
        body: `Your Fast Response OTP is ${otp}. Valid for 5 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });
    }

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      otp
    });
  } catch (err) {
    console.error("Send OTP Error:", err);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};


exports.verifyPhoneOTP = async (req, res) => {
  try {
    let { phone, otp } = req.body;
    phone = normalizePhone(phone);

    const user = await User.findOne({ phone });

    if (!user || !user.phoneOTP || !user.phoneOTPExpires)
      return res.status(400).json({ success: false, message: "OTP not requested" });

    if (Date.now() > user.phoneOTPExpires) {
      if (user.isTemp) {
        await User.deleteOne({ _id: user._id });
      }
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    const isMatch = await bcrypt.compare(otp, user.phoneOTP);
    if (!isMatch)
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    user.isPhoneVerified = true;
    user.isTemp = false;
    user.phoneOTP = undefined;
    user.phoneOTPExpires = undefined;
    await user.save();

    const token = generateToken(user);

    const responseData = {
      success: true,
      token,
      message: "OTP verified successfully.",
      isProfileCompleted: !!user.isProfileCompleted,
    };

    if (user.isProfileCompleted) {
      responseData.user = safeUserResponse(user);
    }

    res.status(200).json(responseData);
  } catch (err) {
    console.error("Verify OTP Error:", err);
    res.status(500).json({ success: false, message: "OTP verification failed" });
  }
};


exports.setProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { firstName, lastName, email, password, location } = req.body;

    const user = await User.findById(userId);
    if (!user || !user.isPhoneVerified)
      return res.status(403).json({ success: false, message: "Phone not verified" });

    if (user.isProfileCompleted)
      return res.status(400).json({ success: false, message: "Profile already completed" });

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    user.firstName = firstName;
    user.lastName = lastName;
    user.email = email;
    user.location = location;
    user.isProfileCompleted = true;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile set successfully",
      isProfileCompleted: true,
      
      user: safeUserResponse(user),
    });
  } catch (err) {
    console.error("Set Profile Error:", err);
    res.status(500).json({ success: false, message: "Profile setup failed" });
  }
};



exports.resendPhoneOTP = async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone)
      return res.status(400).json({ success: false, message: "Phone required" });

    phone = normalizePhone(phone);

    const user = await User.findOne({ phone });
    if (!user || user.isPhoneVerified)
      return res.status(400).json({ success: false, message: "OTP resend not allowed" });

    const OTP_LIMIT = 3;
    const COOLDOWN = 60;           
    const BLOCK_TIME = 6 * 60 * 60;

    const cooldownKey = `otp:cooldown:${phone}`;
    const attemptsKey = `otp:attempts:${phone}`;
    const blockedKey = `otp:blocked:${phone}`;

    if (await redis.exists(blockedKey))
      return res.status(429).json({
        success: false,
        message: "Too many attempts. Try again after 6 hours",
      });

    if (await redis.exists(cooldownKey))
      return res.status(429).json({
        success: false,
        message: "Please wait before requesting OTP again",
      });

    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, BLOCK_TIME);

    if (attempts > OTP_LIMIT) {
      await redis.set(blockedKey, 1, "EX", BLOCK_TIME);
      return res.status(429).json({
        success: false,
        message: "OTP attempts exceeded. Try again later",
      });
    }

    await redis.set(cooldownKey, 1, "EX", COOLDOWN);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneOTP = await bcrypt.hash(otp, 10);
    user.phoneOTPExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    if (process.env.NODE_ENV !== "development") {
      await client.messages.create({
        body: `Your Fast Response OTP is ${otp}. Valid for 5 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });
    }

    res.status(200).json({ success: true, message: "OTP resent successfully" });
  } catch (err) {
    console.error("Resend OTP Error:", err);
    res.status(500).json({ success: false, message: "Failed to resend OTP" });
  }
};
