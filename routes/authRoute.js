const express = require("express");
const passport = require("passport");
const { protect , authorize} = require("../middelware/authMiddelware");
const jwt = require("jsonwebtoken");
const User = require("../model/user");
const FRONTEND_URL = process.env.FRONTEND_URL || "https://whimsical-fenglisu-4a7b67.netlify.app";
const {
  registerClient,
  registerTechnician,
  login,
  verifyEmail,
  getProfile,
  registeradmin,
} = require("../controllers/authController");

const router = express.Router();

router.post("/client-register", registerClient);
router.post("/technician-register", protect, registerTechnician);
router.post("/login", login);
router.post("/verify-otp", verifyEmail);
router.get("/profile",protect, getProfile);
router.post("/admin-register", registeradmin);




router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);


router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/failure" }),
  (req, res) => {
    try {
      const token = req.user.token;

      if (!token) {
        console.log("Google Login Failed: Token Missing");
        return res.redirect(`${FRONTEND_URL}/auth/error`);
      }

      return res.redirect(`${FRONTEND_URL}/auth/?token=${token}`);

    } catch (err) {
      console.error("Google Callback Error:", err);
      return res.redirect(`${FRONTEND_URL}/auth/error`);
    }
  }
);

router.get("/failure", (req, res) => {
  res.status(401).json({ message: " Authentication failed" });
});

module.exports = router;
