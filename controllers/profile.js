const User = require("../model/user");

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updated = await User.findByIdAndUpdate(userId, req.body, { new: true });
    res.json({ message: "Profile updated successfully", user: updated });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.updateProfileClient = async (req, res) => {
  try {
    const userId = req.user.id;
    const allowedUpdates = [
      "firstName",
      "lastName",
      "phone",
      "address",
      "avatar",
      "location"
    ]; 
    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields provided for update" });
    }
    const updatedClient = await User.findByIdAndUpdate(
      userId,
      { ...updates, role: "client" }, 
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedClient
    });
  } catch (err) {
    console.error("Client profile update error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 🟡 SOFT DELETE CLIENT
exports.deleteClient = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can delete a client" });
    }

    const clientId = req.params.id;
    const client = await User.findById(clientId);

    if (!client || client.role !== "client") {
      return res.status(404).json({ message: "Client not found" });
    }

    client.isActive = false;
    client.deletedAt = new Date(); // track delete time

    await client.save();

    res.json({
      success: true,
      message: "Client deleted successfully (soft delete)"
    });

  } catch (err) {
    console.error("Delete client error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};



exports.updateProfileTechnician = async (req, res) => {
  try {
    const userRole = req.user.role; 
    const userId = req.params.id;   

    
    if (userRole !== "admin") {
      return res.status(403).json({ message: "Only admin can update technician profiles" });
    }

  
    const updates = { ...req.body };

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No fields provided for update" });
    }

    const updatedTechnician = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    );

    if (!updatedTechnician) {
      return res.status(404).json({ message: "Technician not found" });
    }

    res.json({
      success: true,
      message: "Technician profile updated successfully",
      user: updatedTechnician
    });
  } catch (err) {
    console.error("Technician profile update error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// 🔵 SOFT DELETE TECHNICIAN
exports.deleteTechnician = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Only admin can delete a technician" });
    }

    const technician = await User.findById(req.params.id);

    if (!technician || technician.role !== "technician") {
      return res.status(404).json({ message: "Technician not found" });
    }

    technician.isActive = false;
    technician.deletedAt = new Date();

    await technician.save();

    res.json({
      success: true,
      message: "Technician deleted successfully (soft delete)"
    });

  } catch (err) {
    console.error("Delete technician error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
