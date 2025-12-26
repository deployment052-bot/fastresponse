const User = require("../../model/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const client = require("../../utils/twillio");
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL);

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role 
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

exports.registerbyPhoneOTP = async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone)
      return res.status(400).json({ success:false, message: "Phone required" });

    phone = normalizePhone(phone);

    let user = await User.findOne({ phone });

  
    // if (user && user.isPhoneVerified) {

    //   return res.status(400).json({ success:false, message: "Phone already verified" });

    // }

    
    if (!user) {
      user = new User({
        phone,
        role: "client",
        isTemp: true
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneOTP = await bcrypt.hash(otp, 10);
    user.phoneOTPExpires = Date.now() + 5 * 60 * 1000;

    await user.save();

if(process.env.NODE_ENV !=='development'){
    await client.messages.create({
      body: `Your Fast Respoanse OTP is ${otp}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });
}
        
    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      otp
    });

  } catch (err) {
    console.error("Send OTP Error:", err);
    res.status(500).json({  success:false, message: "Failed to send OTP" });
  }
};




exports.verifyPhoneOTP = async (req, res) => {
  try {
    let { phone, otp } = req.body;
    phone = normalizePhone(phone);

    const user = await User.findOne({ phone });

    if (!user)
      return res.status(404).json({ success:false, message: "OTP not requested" });

    if (!user.phoneOTP || !user.phoneOTPExpires)
      return res.status(400).json({ success:false, message: "OTP not requested" });

    if (Date.now() > user.phoneOTPExpires) {
     
      if (user.isTemp) {
        await User.deleteOne({ _id: user._id });
      }
      return res.status(400).json({  success:false,message: "OTP expired" });
    }

    const isMatch = await bcrypt.compare(otp, user.phoneOTP);
    if (!isMatch)
      return res.status(400).json({ success:false, message: "Invalid OTP" });

    user.isPhoneVerified = true;
    user.isTemp = false;
    user.phoneOTP = undefined;
    user.phoneOTPExpires = undefined;

    await user.save();

    const token = generateToken(user);

  const resposeData={
          success:true,
          token,
         message: "OTP verified successfully.",
      isProfileCompleted: !!user.isProfileCompleted,
        }
        
        if(user.isProfileCompleted===true){
          resposeData.user=user;
        }
    res.status(200).json(resposeData);

  } catch (err) {
    console.error("Verify OTP Error:", err);
    res.status(500).json({  success:false, message: "OTP verification failed" });
  }
};


exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { firstName, lastName, email, password, location } = req.body;

    const user = await User.findById(userId);

    if (!user || !user.isPhoneVerified)
      return res.status(403).json({ success:false, message: "Phone not verified" });

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    user.firstName = firstName;
    user.lastName = lastName;
    user.email = email;
    user.location = location;
    user.isProfileCompleted = true;

    await user.save();

    res.status(201).json({
      message: "Profile updated successfully",
      user
    });

  } catch (err) {
    console.error("Profile Update Error:", err);
    res.status(500).json({ success:false, message: "Profile update failed" });
  }
};


exports.setProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user.isPhoneVerified)
      return res.status(403).json({ success:false, message: "Phone not verified" });

    if (user.isProfileCompleted)
      return res.status(400).json({  success:false,message: "Profile already set" });

    const allowedFields = [
      "firstName",
      "lastName",
      "email",
      "password",
      "location",
      
    ];

    const updates = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates[f] = req.body[f];
      }
    });

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    Object.assign(user, updates);
    user.isProfileCompleted = true;

    await user.save();

    res.status(201).json({
      message: "Profile set successfully",
          isProfileCompleted: user.isProfileCompleted,
      user
    });

  } catch (err) {
      console.error("Profile Update Error:", err);
    res.status(500).json({ success:false, message: "Server error" });
  }
};


exports.resendPhoneOTP = async (req, res) => {
  try {
    let { phone } = req.body;
    if (!phone)
      return res.status(400).json({ success:false, message: "Phone required" });

    const OTP_LIMIT = 3;
    const COOLDOWN = 60;           
    const BLOCK_TIME = 1 * 60 * 60; 

    phone = normalizePhone(phone);

    const user = await User.findOne({ phone });
    if (!user || user.isPhoneVerified)
      return res.status(400).json({  success:false,message: "OTP resend not allowed" });

    const cooldownKey = `otp:cooldown:${phone}`;
    const attemptsKey = `otp:attempts:${phone}`;
    const blockedKey = `otp:blocked:${phone}`;


    const isBlocked = await redis.exists(blockedKey);
    if (isBlocked)
      return res.status(429).json({
     success:false,
        message: "OTP attempts exceeded. Try again after 6 hours"
      });


    const isCooldown = await redis.exists(cooldownKey);
    if (isCooldown)
      return res.status(429).json({  success:false,message: "Wait before requesting OTP again" });


    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, BLOCK_TIME);

  
    if (attempts > OTP_LIMIT) {
      await redis.set(blockedKey, 1, "EX", BLOCK_TIME);
      return res.status(429).json({
        message: "OTP attempts exceeded. Try again after 6 hours"
      });
    }


    await redis.set(cooldownKey, 1, "EX", COOLDOWN);


    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.phoneOTP = await bcrypt.hash(otp, 10);
    user.phoneOTPExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    await client.messages.create({
      body: `Your Fast Response OTP is ${otp}. Valid for 5 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });

    res.status(200).json({success:true, message: "OTP resent successfully" });

  } catch (err) {
    console.error("Resend OTP Error:", err);
    res.status(500).json({
      success:false,
      message: "Failed to resend OTP" });
  }
};




