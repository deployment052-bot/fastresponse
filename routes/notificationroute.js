const express = require("express");
const { protect } = require("../middelware/authMiddelware");
const {
  markNotificationsAsRead,
  markSingleNotificationRead,
  getNotifications
} = require("../controllers/helpercontroller");
const Notification=require('../model/Notification')
const router = express.Router();


router.get("/", protect, getNotifications);


router.post("/mark-read", protect, markNotificationsAsRead);


router.patch("/:id/read", protect, markSingleNotificationRead);
router.get("/count", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 });

    const unreadCount = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({
      success: true,
      notifications,
      notificationCount: unreadCount
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
