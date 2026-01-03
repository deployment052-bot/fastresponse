const express = require("express");
const router = express.Router();

const {
  getServices,getCategoriesWithServices 
} = require("../controllers/servicecard");

router.get("/show", getServices);
router.get("/categories", getCategoriesWithServices);

module.exports = router;
