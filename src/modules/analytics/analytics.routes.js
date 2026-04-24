const express = require('express');
const { getDashboardStats, getUserPerformance, getTrends } = require('./analytics.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard', getDashboardStats);
router.get('/performance', authorize('ADMIN'), getUserPerformance);
router.get('/trends', getTrends);

module.exports = router;
