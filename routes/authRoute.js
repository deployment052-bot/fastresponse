const express = require("express");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const User = require("../model/user");
const {
  registerClient,
  registerTechnician,
  login,
  verifyEmail,
  getProfile,
} = require("../controllers/authController");
const { protect } = require("../middelware/authMiddelware");

const router = express.Router();

// -------------------- Normal register/login --------------------
router.post("/client-register", registerClient);
router.post("/technician-register", registerTechnician);
router.post("/login", login);
router.post("/verify-otp", verifyEmail);
router.get("/profile", protect, getProfile);

// -------------------- GOOGLE LOGIN (CLIENT ONLY) --------------------
router.get(
  "/google",
  (req, res, next) => {
    if ((req.query.role || "client") !== "client") {
      return res.status(403).json({ message: "Only client allowed" });
    }
    next();
  },
  passport.authenticate("google", { scope: ["email", "profile"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/failure" }),
  (req, res) => {
    try {
      const token = jwt.sign(
        { id: req.user._id, role: req.user.role, email: req.user.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      // Safe FRONTEND URL handling
      const FRONTEND = process.env.FRONTEND_URL || "http://localhost:5173";
      const frontendUrl = FRONTEND.endsWith("/")
        ? FRONTEND.slice(0, -1)
        : FRONTEND;

      // Redirect to frontend with token, role, email
      res.redirect(
        `${frontendUrl}/?token=${token}&role=${req.user.role}&email=${req.user.email}`
      );
    } catch (err) {
      console.error("Google Callback Error:", err);
      res.redirect("/auth/failure");
    }
  }
);

// -------------------- FACEBOOK LOGIN (CLIENT ONLY) --------------------
router.get(
  "/facebook",
  (req, res, next) => {
    if ((req.query.role || "client") !== "client") {
      return res.status(403).json({ message: "Only client allowed" });
    }
    next();
  },
  passport.authenticate("facebook", { scope: ["email"] })
);

router.get(
  "/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/auth/failure" }),
  async (req, res) => {
    try {
      let user = await User.findOne({
        $or: [
          { email: req.user.emails?.[0]?.value },
          { facebookId: req.user.id },
        ],
      });

      if (!user) {
        user = await User.create({
          facebookId: req.user.id,
          firstName: req.user.name?.givenName || "",
          lastName: req.user.name?.familyName || "",
          email: req.user.emails?.[0]?.value || `fb_${req.user.id}@facebook.com`,
          avatar: req.user.photos?.[0]?.value || "",
          role: "client",
        });
      } else {
        user.facebookId = req.user.id;
        user.avatar = req.user.photos?.[0]?.value || user.avatar;
        await user.save();
      }

      const token = jwt.sign(
        { id: user._id, role: user.role, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      const FRONTEND = process.env.FRONTEND_URL || "http://localhost:5173";
      const frontendUrl = FRONTEND.endsWith("/")
        ? FRONTEND.slice(0, -1)
        : FRONTEND;

      res.redirect(`${frontendUrl}/?token=${token}&role=${user.role}&email=${user.email}`);
    } catch (err) {
      console.error("Facebook Callback Error:", err);
      res.redirect("/auth/failure");
    }
  }
);

// -------------------- FAILURE ROUTE --------------------
router.get("/failure", (req, res) => {
  res.status(401).json({ message: "❌ Authentication failed" });
});

module.exports = router;
