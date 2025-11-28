const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const jwt = require("jsonwebtoken");
const User = require("../model/user");

const BASE_URL =
  process.env.BACKEND_URL?.replace(/\/$/, "") || "http://localhost:5000";

/* ================= GOOGLE STRATEGY ================= */
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        if (!profile.emails?.length) {
          return done(new Error("No email from Google"), null);
        }

        const email = profile.emails[0].value;

        let user = await User.findOne({ email });

        if (!user) {
          user = await User.create({
            googleId: profile.id,
            firstName: profile.name?.givenName || "",
            lastName: profile.name?.familyName || "",
            email,
            avatar: profile.photos?.[0]?.value || "",
            authProvider: "google",
            role: "client",
          });
        } else {
          user.googleId = profile.id;
          user.avatar = profile.photos?.[0]?.value || user.avatar;
          await user.save();
        }

        // 🔥 Generate JWT TOKEN
        const token = jwt.sign(
          { id: user._id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

        // Pass token to callback
        return done(null, { ...user.toObject(), token });

      } catch (err) {
        console.error("Google Strategy Error:", err);
        return done(err, null);
      }
    }
  )
);

/* ================= FACEBOOK STRATEGY ================= */
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: `${BASE_URL}/auth/facebook/callback`,
      profileFields: ["id", "emails", "name", "photos"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email =
          profile.emails?.[0]?.value || `fb_${profile.id}@facebook.com`;

        let user = await User.findOne({ email });

        if (!user) {
          user = await User.create({
            facebookId: profile.id,
            firstName: profile.name?.givenName || "",
            lastName: profile.name?.familyName || "",
            email,
            avatar: profile.photos?.[0]?.value || "",
            authProvider: "facebook",
            role: "client",
          });
        } else {
          user.facebookId = profile.id;
          user.avatar = profile.photos?.[0]?.value || user.avatar;
          await user.save();
        }

        // 🔥 Generate JWT TOKEN for facebook too
        const token = jwt.sign(
          { id: user._id, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

        return done(null, { ...user.toObject(), token });

      } catch (err) {
        console.error("Facebook Strategy Error:", err);
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

module.exports = passport;
