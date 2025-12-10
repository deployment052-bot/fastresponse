const Notification = require("../model/Notification");
const User = require("../model/user");
const dayjs = require("dayjs");
const relativeTime = require("dayjs/plugin/relativeTime");
dayjs.extend(relativeTime);

exports.sendNotification = async (userId, role, title, message, type = "info", link = "") => {
  try {
    const notification = new Notification({
      user: userId,
      role,
      title,
      message,
      type,
      link,
    });

    await notification.save();

   
    await User.findByIdAndUpdate(userId, { $inc: { notificationCount: 1 } });

    return notification;
  } catch (err) {
    console.error("Notification Error:", err);
    throw err;
  }
};


exports.markNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

 
    await Notification.updateMany({ user: userId, read: false }, { $set: { read: true } });

    
    await User.findByIdAndUpdate(userId, { $set: { notificationCount: 0 } });

    res.json({ success: true, message: "Notifications marked as read." });
  } catch (err) {
    console.error("Mark Read Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


exports.markSingleNotificationRead = async (req, res) => {
  try {
    const notificationId = req.params.id;
    const notification = await Notification.findById(notificationId);

    if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });

    if (!notification.read) {
      notification.read = true;
      await notification.save();

   
      await User.findByIdAndUpdate(notification.user, { $inc: { notificationCount: -1 } });
    }

    res.json({ success: true, message: "Notification marked as read." });
  } catch (err) {
    console.error("Mark Single Notification Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};






exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const notifications = await Notification.find({ user: userId }).sort({ createdAt: -1 });
    const user = await User.findById(userId);

    const notificationsWithTimeAgo = notifications.map(n => {
      const diffMinutes = dayjs().diff(dayjs(n.createdAt), 'minute');
      let timeAgo = dayjs(n.createdAt).fromNow();

    
      if (diffMinutes < 1) {
        timeAgo = "just now";
      }

      return {
        _id: n._id,
        user: n.user,
        role: n.role,
        title: n.title,
        message: n.message,
        type: n.type,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        timeAgo
      };
    });

    res.status(200).json({
      success: true,
      notifications: notificationsWithTimeAgo,
      notificationCount: user.notificationCount || 0
    });
  } catch (err) {
    console.error("Get Notifications Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


