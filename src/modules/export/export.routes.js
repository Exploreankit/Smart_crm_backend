const express = require('express');
const { exportLeadsCSV, exportLeadsJSON } = require('./export.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/leads/csv', exportLeadsCSV);
router.get('/leads/json', exportLeadsJSON);

module.exports = router;
