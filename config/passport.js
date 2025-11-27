const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const jwt = require("jsonwebtoken");
const User = require("../model/user");

const BASE_URL =
  process.env.BACKEND_URL?.replace(/\/$/, "") || "http://localhost:5000";
const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "https://whimsical-fenglisu-4a7b67.netlify.app";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/auth/google/callback`,
    },
    async (_, __, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("Google account has no email"), null);

        let user = await User.findOne({ email });

        if (!user) {
          user = await User.create({
            googleId: profile.id,
            firstName: profile.name?.givenName || "",
            lastName: profile.name?.familyName || "",
            displayName: profile.displayName || "",
            email,
            avatar: profile.photos?.[0]?.value || "",
            role: "client",
          });
        } else {
          user.googleId = profile.id;
          user.avatar = profile.photos?.[0]?.value || user.avatar;
          user.displayName = profile.displayName || user.displayName;
          await user.save();
        }

        // 🔥 Generate token
        const token = jwt.sign(
          { id: user._id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

        // 🔥 Ye FINALE FIX — user ke object me token attach
        const userData = {
          ...user._doc,
          token,
        };

        return done(null, userData);
      } catch (err) {
        console.error("Google Auth Error:", err);
        return done(err, null);
      }
    }
  )
);


passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

module.exports = passport;
