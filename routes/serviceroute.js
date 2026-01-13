const express = require("express");
const router = express.Router();

const {
  getServices,getCategoriesWithServices ,smartServiceSearch
} = require("../controllers/servicecard");

router.get("/show", getServices);
router.get("/categories", getCategoriesWithServices);
router.get('/get-key',smartServiceSearch)
module.exports = router;
