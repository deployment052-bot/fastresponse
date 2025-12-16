const mongoose= require('mongoose')
const Work = require("../model/work");
const User = require("../model/user");
const Booking=require("../model/BookOrder")
const jwt = require("jsonwebtoken");

const axios = require("axios");
const AdminNotification=require('../model/adminnotification')
const Notification=require('../model/Notification');
const work = require('../model/work');


exports.resolveWorkIssue = async (req, res) => {
  try {
    const { workId, issueId } = req.body;
   const adminId =
      req.user && req.user._id ? req.user._id : req.body.adminId;

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: "Work not found" });

    const issue = work.issues.id(issueId);
    if (!issue) return res.status(404).json({ message: "Issue not found" });

    
    issue.status = "resolved";
    issue.resolvedBy = adminId;
    issue.resolvedAt = new Date();

    //     if (issue.issueType === "need_specialist") {
    //   issue.specialistInfo = {
    //     technicianName: `${work.assignedTechnician.firstName} ${work.assignedTechnician.lastName}`,
    //     technicianPhone: work.assignedTechnician.phone,
    //   };
    // }

   
    work.issueCount = Math.max(0, (work.issueCount || 0) - 1);

   
    const openIssues = work.issues.filter((i) => i.status === "open");
    if (openIssues.length === 0) {
      work.status = "inprogress";
    }

    await work.save();

    res.status(200).json({
      message: "Issue resolved successfully",
      work,
    });

  } catch (error) {
    console.error("Resolve Issue Error:", error);
    res.status(500).json({ message: "Failed to resolve issue" });
  }
};

exports.getTechnicianWorkForAdmin = async (req, res) => {
  try {
    const { technicianId } = req.body;

    if (!technicianId) {
      return res.status(400).json({ message: "Technician ID is required" });
    }

   
    const technician = await User.findById(technicianId).select(
      "firstName lastName email phone"
    );

    if (!technician) {
      return res.status(404).json({ message: "Technician not found" });
    }

 
    const works = await Work.find({ assignedTechnician: technicianId })
      .populate("client", "firstName lastName phone location ")
      .populate("invoice")
      .sort({ createdAt: -1 });

 
    const totalWorkCount = works.length;

    const activeCount = works.filter(w =>
      ["dispatch", "inprogress","approved"].includes(w.status)
    ).length;

    const completedCount = works.filter(w => w.status === "completed").length;

    const rejectedCount = works.filter(w => w.status === "rejected").length;

   
    const totalEarnings = works.reduce((sum, work) => {
      const invoiceTotal = work.invoice?.total || 0;
      const serviceCharge = work.serviceCharge || 0;
      return sum + invoiceTotal + serviceCharge;
    }, 0);

   
    res.status(200).json({
      success: true,
      technician,
      summary: {
        totalWorkCount,
        activeCount,
        completedCount,
        rejectedCount,
        totalEarnings,
      },
      works,  // All work details list
    });

  } catch (error) {
    console.error("Admin Technician Work Summary Error:", error);
    res.status(500).json({
      message: "Failed to fetch technician work summary",
      error: error.message,
    });
  }
};


exports.getAllTechniciansForAdmin = async (req, res) => {
  try {
    
    const technicians = await User.find({ role: "technician" })
      .select("firstName lastName email phone createdAt location specialization responsibility");

    res.status(200).json({
      success: true,
      count: technicians.length,
      technicians,
    });

  } catch (err) {
    console.error("Get All Technicians Error:", err);
    res.status(500).json({
      success: false,
      message: "Unable to fetch technicians",
    });
  }
};

exports.getAllClientForAdmin=async (req,res)=>{
try{
    const client =await User.find ({role:"client"})
  .select("firstName lastName email phone location createdAt");
  res.status(200).json
({
  success:true,
  count:client.length,
  client,
})
}catch(err){
console.error("Get all client error",err)
res.status(500).json
({
  success:false,
  message:"unable to fetch client "
})}

};

exports.getclientWorkForAdmin = async (req, res) => {
  try {
    const { client } = req.body;

    if (!client) {
      return res.status(400).json({ message: "client ID is required" });
    }

   
    const clientid = await User.findById(client).select(
      "firstName lastName email phone"
    );
     console.log(clientid)
    if (!clientid) {
      return res.status(404).json({ message: "client not found" });
    }

 
    const works = await Work.find({ client: clientid })
      .populate("assignedTechnician", "firstName lastName phone location specialization")
      
      .sort({ createdAt: -1 });

 
    const totalWorkCount = works.length;

    const activeCount = works.filter(w =>
      ["dispatch", "inprogress","approved"].includes(w.status)
    ).length;

    const completedCount = works.filter(w => w.status === "completed").length;

    const rejectedCount = works.filter(w => w.status === "rejected").length;
res.status(200).json({
      success: true,
      clientid,
      summary: {
        totalWorkCount,
        activeCount,
        completedCount,
        rejectedCount,
      
      },
      works,  
    });

  } catch (error) {
    console.error("Admin Technician Work Summary Error:", error);
    res.status(500).json({
      message: "Failed to fetch technician work summary",
      error: error.message,
    });
  }
};


exports.getAllWorkAdmin=async (req,res)=>{
try{
    const work =await Work.find ({})
  .populate("client","firstName lastName email phone location createdAt")
  .populate("assignedTechnician","firstName lastName email phone location")
  .sort({createAt:-1})
  res.status(200).json
({
  success:true,
  count:work.length,
  work,
})
}catch(err){
console.error("Get all work error",err)
res.status(500).json
({
  success:false,
  message:"unable to fetch work "
})}

};


exports.getOpenIssues = async (req, res) => {
  try {
    const countResult = await Work.aggregate([
      { $unwind: "$issues" },
      { $match: { "issues.status": "open" } },
      { $count: "count" }
    ]);

    const openIssueCount = countResult.length > 0 ? countResult[0].count : 0;

    const worksWithIssues = await Work.find({ "issues.status": "open" })
      .populate("client", "firstName lastName phone location")
      .populate("assignedTechnician", "firstName lastName phone")
      .sort({ createdAt: -1 });

    const issuesList = [];

    worksWithIssues.forEach(work => {
      work.issues.forEach(issue => {

        if (issue.status === "open") {
          let pendingPartsCount = 0;

          if (issue.issueType === "need_parts" && issue.parts) {
            pendingPartsCount = issue.parts.filter(
              p => p.status === "pending_fastresponse"
            ).length;
          }

          issuesList.push({
            issueId: issue._id,
            message: issue.message,
            raisedBy: issue.raisedBy,
            raisedAt: issue.raisedAt,
            workId: work._id,
            workStatus: work.status,
            serviceType: work.serviceType,
            client: work.client,
            issueType: issue.issueType,
            technician: work.assignedTechnician,
            pendingPartsCount // ✔ Added Here
          });
        }
      });
    });

    res.status(200).json({
      success: true,
      count: openIssueCount,
      issues: issuesList
    });

  } catch (err) {
    console.error("Open Issues Fetch Error:", err);
    res.status(500).json({ message: "Failed to fetch open issues" });
  }
};

exports.getAllIssues = async (req, res) => {
  try {
    const { status } = req.query; 
    const matchStage = {};

    if (status) {
      matchStage["issues.status"] = status;
    }

    const worksWithIssues = await Work.aggregate([
      { $unwind: "$issues" },
      { $match: Object.keys(matchStage).length ? matchStage : {} },
      {
        $project: {
          workId: "$_id",
          client: 1,
          assignedTechnician: 1,
          serviceType: 1,
          token: 1,
          issue: "$issues"
        }
      },
      { $sort: { "issue.raisedAt": -1 } }
    ]);

    const populated = await Promise.all(
      worksWithIssues.map(async (item) => {
        const client = await User.findById(item.client).select("firstName lastName phone");
        const technician = await User.findById(item.assignedTechnician).select("firstName lastName phone");

        let pendingPartsCount = 0;
        if (item.issue.issueType === "need_parts" && item.issue.parts) {
          pendingPartsCount = item.issue.parts.filter(
            p => p.status === "pending_fastresponse",
            p=>p.status === "approved_fastresponse"
          ).length;
        }

        return {
          ...item,
          client,
          technician,
          pendingPartsCount // ✔ Added Here
        };
      })
    );

    res.status(200).json({
      success: true,
      totalIssues: populated.length,
      issues: populated
    });

  } catch (err) {
    console.error("Get All Issues Error:", err);
    res.status(500).json({
      message: "Failed to fetch issues",
      error: err.message,
    });
  }
};

exports.getPartsPendingRequests = async (req, res) => {
  try {
    const works = await Work.find({
      "issues.issueType": "need_parts",
    })
      .populate("client", "firstName lastName phone location")
      .populate("assignedTechnician", "firstName lastName phone");

    let grandTotalPendingParts = 0;

    const finalResponse = works
      .map((work) => {
        let workPendingCount = 0;

        const filteredIssues = work.issues
          .map((issue) => {
            if (issue.issueType !== "need_parts") return null;

            // Count pending parts only (open or pending_fastresponse)
            const pendingPartsCount = issue.parts.filter(
              (p) => p.status === "open" || p.status === "pending_fastresponse"
            ).length;

            if (pendingPartsCount === 0) return null; // no pending parts → skip issue

            workPendingCount += pendingPartsCount;
            grandTotalPendingParts += pendingPartsCount;

            return {
              ...issue.toObject(),
              pendingPartsCount,

              // Show ALL parts (details) with isPending flag
              parts: issue.parts.map((p) => ({
                _id: p._id,
                itemName: p.itemName,
                quantity: p.quantity,
                status: p.status,
                remarks: p.remarks,
                isPending: p.status === "open" || p.status === "pending_fastresponse"
              }))
            };
          })
          .filter(Boolean);

        if (!filteredIssues.length) return null;

        return {
          ...work.toObject(),
          issues: filteredIssues,
          pendingPartsCount: workPendingCount
        };
      })
      .filter(Boolean);

    res.status(200).json({
      success: true,
      totalPendingParts: grandTotalPendingParts,
      works: finalResponse
    });

  } catch (err) {
    console.error("Error fetching pending parts:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updatePartStatus = async (req, res) => {
  try {
    const { workId, issueId, partId, action } = req.body;

    const newStatus =
      action === "approve"
        ? "approved_fastresponse"
        : "rejected_fastresponse";

    const work = await Work.findOneAndUpdate(
      {
        _id: workId,
        "issues._id": issueId,
        "issues.parts._id": partId,
      },
      {
        $set: {
          "issues.$[i].parts.$[p].status": newStatus,
          "issues.$[i].parts.$[p].updatedOn": new Date(),
        },
      },
      {
        arrayFilters: [{ "i._id": issueId }, { "p._id": partId }],
        new: true,
      }
    );

    if (!work) {
      return res.status(404).json({ message: "Part not found" });
    }

    const issue = work.issues.id(issueId);

    const stillPending = issue.parts.some(
      (p) => p.status === "pending_fastresponse"
    );

    if (!stillPending) {
      
      issue.parts.forEach((p) => {
        if (p.status === "approved_fastresponse") {
          p.status = "pending_ims";
        }
      });

      await work.save();

      console.log("Sending approved parts to IMS...");

      const imsToken = jwt.sign(
        { system: "FR" },
        process.env.IMS_JWT_SECRET,
        { expiresIn: "1d" }
      );

      const imsRequests = issue.parts
        .filter((p) => p.status === "pending_ims")
        .map((p) => ({
          itemName: p.itemName,
          quantity: p.quantity,
          Decofitem: p.Decofitem || "not provided", 
          requiredDate: p.requiredDate || new Date(),
          deliveryAddress: work.location || "",
          workRefId: work._id,
          partRefId: p._id,
        }));

      const imsBaseUrl = process.env.IMS_BASE_URL;

      await Promise.all(
        imsRequests.map((reqObj) =>
          axios.post(`${imsBaseUrl}/api/request/from-fr`, reqObj, {
            headers: { Authorization: `Bearer ${imsToken}` },
            
          })
          
        )
        
      );
    
      console.log("IMS Requests Sent Successfully! 🚀");
    }

    return res.status(200).json({
      success: true,
      message: `Part status updated to ${newStatus}`,
      work,
    });
  } catch (error) {
    console.error("Update Part Status Error:", error);
    return res.status(500).json({
      message: "Failed to update part status",
      error: error.message,
    });
  }
};

exports.getAllPartsRequests = async (req, res) => {
  try {
    // Fetch all works that have "need_parts" issues
    const works = await Work.find({
      "issues.issueType": "need_parts"
    })
      .populate("client", "firstName lastName phone location")
      .populate("assignedTechnician", "firstName lastName phone");

    let totalPendingParts = 0;

    const finalData = works.map((work) => {
      let workPendingCount = 0;

      const issues = work.issues
        .filter(issue => issue.issueType === "need_parts")
        .map(issue => {
          // Count pending parts only
          const pendingPartsCount = issue.parts.filter(
            p => p.status === "open" || p.status === "pending_fastresponse"
          ).length;

          workPendingCount += pendingPartsCount;
          totalPendingParts += pendingPartsCount;

          // Map all parts with full details + isPending flag
          const parts = issue.parts.map(p => ({
            _id: p._id,
            itemName: p.itemName,
            quantity: p.quantity,
            status: p.status,
            remarks: p.remarks,
            isPending: p.status === "open" || p.status === "pending_fastresponse",
            requiredDate: p.requiredDate || null,
            Decofitem: p.Decofitem || null,
            updatedOn: p.updatedOn || null
          }));

          return {
            ...issue.toObject(),
            pendingPartsCount,
            parts
          };
        });

      return {
        ...work.toObject(),
        issues,
        pendingPartsCount: workPendingCount
      };
    });

    res.status(200).json({
      success: true,
      totalPendingParts,
      works: finalData
    });

  } catch (err) {
    console.error("Error fetching all need parts:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};



exports.getAllPartsRequests = async (req, res) => {
  try {
    // Fetch all works that have "need_parts" issues
    const works = await Work.find({
      "issues.issueType": "need_parts"
    })
      .populate("client", "firstName lastName phone location")
      .populate("assignedTechnician", "firstName lastName phone");

    let totalPendingParts = 0;

    const finalData = works.map((work) => {
      let workPendingCount = 0;

      const issues = work.issues
        .filter(issue => issue.issueType === "need_parts")
        .map(issue => {
          // Count pending parts only
          const pendingPartsCount = issue.parts.filter(
            p => p.status === "open" || p.status === "pending_fastresponse"
          ).length;

          workPendingCount += pendingPartsCount;
          totalPendingParts += pendingPartsCount;

          // Map all parts with full details + isPending flag
          const parts = issue.parts.map(p => ({
            _id: p._id,
            itemName: p.itemName,
            quantity: p.quantity,
            status: p.status,
            remarks: p.remarks,
            isPending: p.status === "open" || p.status === "pending_fastresponse",
            requiredDate: p.requiredDate || null,
            Decofitem: p.Decofitem || null,
            updatedOn: p.updatedOn || null
          }));

          return {
            ...issue.toObject(),
            pendingPartsCount,
            parts
          };
        });

      return {
        ...work.toObject(),
        issues,
        pendingPartsCount: workPendingCount
      };
    });

    res.status(200).json({
      success: true,
      totalPendingParts,
      works: finalData
    });

  } catch (err) {
    console.error("Error fetching all need parts:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getNeedPartsByWorkId = async (req, res) => {
  try {
    const { workId } = req.params;

    if (!workId) {
      return res.status(400).json({ success: false, message: "Work ID is required" });
    }

    const work = await Work.findById(workId)
      .populate("client", "firstName lastName phone location")
      .populate("assignedTechnician", "firstName lastName phone");

    if (!work) {
      return res.status(404).json({ success: false, message: "Work not found" });
    }

 
    const issues = work.issues
      .filter(issue => issue.issueType === "need_parts")
      .map(issue => {
        const pendingPartsCount = issue.parts.filter(
          p => p.status === "open" || p.status === "pending_fastresponse"
        ).length;

        const parts = issue.parts.map(p => ({
          _id: p._id,
          itemName: p.itemName,
          quantity: p.quantity,
          status: p.status,
          remarks: p.remarks,
          isPending: p.status === "open" || p.status === "pending_fastresponse",
          requiredDate: p.requiredDate || null,
          Decofitem: p.Decofitem || null,
          updatedOn: p.updatedOn || null
        }));

        return {
          ...issue.toObject(),
          pendingPartsCount,
          parts
        };
      });

    res.status(200).json({
      success: true,
      workId: work._id,
      client: work.client,
      technician: work.assignedTechnician,
      issues,
      totalPendingParts: issues.reduce((acc, i) => acc + i.pendingPartsCount, 0)
    });

  } catch (err) {
    console.error("Error fetching need parts by work ID:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};



exports.getIssueChartCounts = async (req, res) => {
  try {
    const result = await Work.aggregate([
      { $unwind: "$issues" },
      {
        $group: {
          _id: "$issues.status",
          count: { $sum: 1 }
        }
      }
    ]);

    let totalIssues = 0;

    const chartCounts = {
      on_hold: 0,      
      resolved: 0,
      unresolved: 0,
      other: 0
    };

    result.forEach(item => {
      totalIssues += item.count;

      if (item._id === "open") {
        chartCounts.on_hold = item.count; 
      } 
      else if (item._id === "resolved") {
        chartCounts.resolved = item.count;
      } 
      else if (item._id === "unresolved") {
        chartCounts.unresolved = item.count;
      } 
      else {
        chartCounts.other += item.count;
      }
    });

    res.status(200).json({
      success: true,
      totalIssues,
      data: chartCounts
    });

  } catch (err) {
    console.error("Issue Chart Count Error:", err);
    res.status(500).json({
      message: "Failed to fetch issue chart counts"
    });
  }
};

exports.unresolveWorkIssue = async (req, res) => {
  try {
    const { workId, issueId } = req.body;
    const adminId = req.user?._id || req.body.adminId;

    const work = await Work.findById(workId);
    if (!work) return res.status(404).json({ message: "Work not found" });

    const issue = work.issues.id(issueId);
    if (!issue) return res.status(404).json({ message: "Issue not found" });

    if (issue.status !== "resolved") {
      return res.status(400).json({
        message: "Only resolved issues can be marked as unresolved",
      });
    }

    issue.status = "unresolved";
    issue.unresolvedBy = adminId;
    issue.unresolvedAt = new Date();

 
    work.issueCount = (work.issueCount || 0) + 1;

   
    const activeIssues = work.issues.filter(
      (i) => i.status === "open" || i.status === "unresolved"
    );

    if (activeIssues.length > 0) {
      work.status = "issue_pending";
    }

    await work.save();

    res.status(200).json({
      success: true,
      message: "Issue marked as unresolved",
      work,
    });

  } catch (error) {
    console.error("Unresolve Issue Error:", error);
    res.status(500).json({ message: "Failed to unresolve issue" });
  }
};
