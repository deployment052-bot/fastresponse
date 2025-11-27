const User = require("../model/user");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendemail");


const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};


const sendVerificationOTP = async (data, email, name) => {
  try {
    const otp = data.otp; // OTP already generated outside

    const html = `
      <div style="font-family:Arial, text-align:center; background:#f9f9f9; padding:20px; border-radius:8px;">
        <h2 style="color:#333;">Email Verification</h2>
        <p>Hello <strong>${name || "User"}</strong>,</p>
        <p>Your OTP for email verification is:</p>
        <h1 style="background:#007bff; color:white; display:inline-block; padding:10px 20px; border-radius:6px;">${otp}</h1>
        <p>This code will expire in <b>10 minutes</b>.</p>
        <hr/>
        <small style="color:#888;">© One Step Solution</small>
      </div>
    `;

    await sendEmail(email, "Your OTP Code - One Step Solution", html);
    console.log(`OTP ${otp} sent to ${email}`);
  } catch (err) {
    console.error("Error sending OTP email:", err.message);
    throw new Error("Failed to send OTP email.");
  }
};


exports.registeradmin = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      confirmPassword,
      designation
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword || !designation)
      return res.status(400).json({ message: "All fields are required." });

    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match." });


    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered." });

    const hashedPassword = await bcrypt.hash(password, 10);

 
    const { otp, token } = generateToken({
      firstName,
      lastName,
      email,
      phone,
      password: hashedPassword,
      role: "admin",
      designation,
    });

    
    await sendVerificationOTP({ email, firstName, otp }, email, firstName);

    res.status(200).json({
      message: "OTP sent to your email. Verify to complete registration.",
      token, 
    });

  } catch (err) {
    console.error("Admin registration error:", err.message);
    res.status(500).json({ message: "Registration failed. Try again later." });
  }
};


exports.registerClient = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, confirmPassword } = req.body;

    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword)
      return res.status(400).json({ message: "All fields are required." });

    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match." });

    // ✅ DB check ONLY
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered." });

    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ create OTP + token (NO DB SAVE)
    const { otp, token } = generateToken({
      firstName,
      lastName,
      email,
      phone,
      password: hashedPassword,
      role: "client",
    });

    await sendVerificationOTP({ email, firstName, otp }, email, firstName);

    res.status(200).json({
      message: "OTP sent to your email. Verify to complete registration.",
      token,
    });
  } catch (err) {
    console.error("Client registration error:", err.message);
    res.status(500).json({ message: "Registration failed. Try again later." });
  }
};


exports.registerTechnician = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      confirmPassword,
      specialization,
      experience,
      location,
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !password || !confirmPassword)
      return res.status(400).json({ message: "All fields are required." });

    if (password !== confirmPassword)
      return res.status(400).json({ message: "Passwords do not match." });

    if (!specialization || !experience)
      return res.status(400).json({ message: "Specialization and experience are required." });

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: "Email already registered." });

    const hashedPassword = await bcrypt.hash(password, 10);

    const specArray = Array.isArray(specialization)
      ? specialization.map(s => s.trim().toLowerCase())
      : specialization.split(",").map(s => s.trim().toLowerCase());

    const { otp, token } = generateToken({
      firstName,
      lastName,
      email,
      phone,
      password: hashedPassword,
      role: "technician",
      specialization: specArray,
      experience,
      location,
      availability: true,
      onDuty: false,
      technicianStatus: "available",
    });

    await sendVerificationOTP({ email, firstName, otp }, email, firstName);

    res.status(200).json({
      message: "Technician registration started. OTP sent to your email.",
      token,
    });
  } catch (err) {
    console.error("Technician registration error:", err.message);
    res.status(500).json({ message: "Registration failed. Try again later." });
  }
};



exports.verifyEmail = async (req, res) => {
  try {
    const { token, otp } = req.body;

    if (!token || !otp)
      return res.status(400).json({ message: "Token and OTP required." });

    let data;
    try {
      data = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: "Invalid or expired token." });
    }

    if (data.otp !== otp)
      return res.status(400).json({ message: "Invalid OTP." });

   
    const user = new User({
      ...data,
      isEmailVerified: true,
    });

    delete user.otp;

    await user.save();

    res.status(200).json({
      message: "Email verified successfully! You can now log in.",
    });
  } catch (err) {
    console.error("Verify email error:", err);
    res.status(500).json({ message: "Server error." });
  }
};


exports.resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    await sendVerificationOTP(user, email, user.firstName);
    res.status(200).json({ message: "OTP resent successfully." });
  } catch (err) {
    console.error("Resend OTP Error:", err.message);
    res.status(500).json({ message: "Failed to resend OTP" });
  }
};


exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password required." });

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials." });

    if (!user.password)
      return res.status(400).json({
        message: "This account was created via Google/Facebook or OTP login. Please use that method.",
      });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid credentials." });

    const token = generateToken(user);
    res.json({ message: "Login successful", token, user });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ message: "Server error during login." });
  }
};



exports.getProfile = async (req, res) => {
  try {
  
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    
    const user = await User.findById(req.user._id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    let profile = {};

    if (user.role === "technician") {
      profile = {
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        email: user.email,
        phone: user.phone,
        location: user.location,
        specialization: user.specialization,
        experience: user.experience,

      };
    }

    
    else if (user.role === "client") {
      profile = {
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        email: user.email,
        phone: user.phone,
        location: user.location || "Not specified",
      };
    }


    
      else if (user.role === "admin") {
      profile = {
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        email: user.email,
        phone: user.phone,
        location: user.location || "Not specified",
        designation:user.designation,
      };
    }
  

    res.status(200).json({
      success: true,
      profile,
    });
  } catch (err) {
    console.error(" Profile Fetch Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getTechnicianSummary = async (req, res) => {
  try {
    const technicianId = req.user._id; 

    const works = await Work.find({ technician: technicianId })
      .populate("client", "name phone email")
      .populate("supervisor", "name")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: works.length,
      works,
    });
  } catch (err) {
    console.error(" Technician Summary Error:", err);
    res.status(500).json({
      success: false,
      message: "Unable to fetch technician summary",
    });
  }
};
