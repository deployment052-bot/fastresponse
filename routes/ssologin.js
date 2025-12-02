// routes/ssoRoutes.js
const express = require("express");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const User = require("../model/user"); // FR Admin model
const router = express.Router();

// Ensure secrets are defined
if (!process.env.JWT_SECRET || !process.env.IMS_JWT_SECRET) {
  console.error("JWT_SECRET or IMS_JWT_SECRET not defined in environment!");
  process.exit(1); // Stop server if secrets are missing
}

/**
 * SSO Login
 * Accepts FR token and returns IMS token
 */
router.post("/sso-login", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(401).json({ message: "Token missing" });

    // Verify FR token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid token", error: err.message });
    }

    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Not authorized: not admin" });
    }

    // Find or create admin user
    let admin = await User.findOne({ email: decoded.email });
    if (!admin) {
      admin = await User.create({
        email: decoded.email,
        firstName: decoded.name || "FastResponse Admin",
        role: "admin",
      });
    }

    // Sign IMS token
    const imsToken = jwt.sign(
      { email: admin.email, name: admin.firstName, role: admin.role },
      process.env.IMS_JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.json({ imsToken });
  } catch (err) {
    console.error("SSO ERROR:", err.message);
    return res.status(500).json({ message: "SSO failed", error: err.message });
  }
});

/**
 * Fetch IMS Stock
 */
router.get("/ims-stock", async (req, res) => {
  try {
    const imsToken = req.headers["x-ims-token"];
    if (!imsToken) return res.status(401).json({ message: "IMS token missing" });

    const response = await axios.get(`${process.env.IMS_BASE_URL}/api/stock/stock-summary`, {
      headers: { Authorization: `Bearer ${imsToken}` },
    });

    res.json(response.data);
  } catch (err) {
    console.error("IMS Stock fetch error:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to fetch IMS stock" });
  }
});

/**
 * IMS Stock In
 */
router.post("/ims-stock-in", async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    const imsToken = req.headers["x-ims-token"];
    if (!imsToken) return res.status(401).json({ message: "IMS token missing" });

    const response = await axios.post(
      `${process.env.IMS_BASE_URL}/api/stock/in`,
      { itemId, quantity },
      { headers: { Authorization: `Bearer ${imsToken}` } }
    );

    res.json(response.data);
  } catch (err) {
    console.error("IMS Stock In error:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to perform stock in" });
  }
});

/**
 * IMS Stock Out
 */
router.post("/ims-stock-out", async (req, res) => {
  try {
    const { itemId, quantity } = req.body;
    const imsToken = req.headers["x-ims-token"];
    if (!imsToken) return res.status(401).json({ message: "IMS token missing" });

    const response = await axios.post(
      `${process.env.IMS_BASE_URL}/api/stock/out`,
      { itemId, quantity },
      { headers: { Authorization: `Bearer ${imsToken}` } }
    );

    res.json(response.data);
  } catch (err) {
    console.error("IMS Stock Out error:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to perform stock out" });
  }
});

module.exports = router;
