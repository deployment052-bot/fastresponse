const express = require("express");

const { protect, authorize } = require("../middelware/authMiddelware");
const User=require('../model/user')
const router = express.Router();
const profile=require('../controllers/profile')

router.put("/update", protect, profile.updateProfile);


router.get("/all", protect, authorize("admin"), async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
});

router.patch('/update-technician/:id',protect,authorize('admin'),profile.updateProfileTechnician)
router.patch('/update-client/:id',protect,authorize('client'),profile.updateProfileClient)
router.delete('/delete-technician/:id',protect,authorize('admin'),profile.deleteTechnician);
router.delete('/delete-client/:id',protect,profile.deleteClient)
module.exports = router;
