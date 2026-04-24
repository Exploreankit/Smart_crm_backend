const express = require('express');
const { body } = require('express-validator');
const {
  getLeads,
  getPipeline,
  getLeadById,
  createLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  addNote,
  logActivity,
} = require('./lead.controller');
const { authenticate, authorize } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

const router = express.Router();

router.use(authenticate);

const leadValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('dealValue').optional().isNumeric().withMessage('Deal value must be a number'),
];

router.get('/', getLeads);
router.get('/pipeline', getPipeline);
router.get('/:id', getLeadById);
router.post('/', leadValidation, validate, createLead);
router.put('/:id', updateLead);
router.patch('/:id/status', [body('status').notEmpty()], validate, updateLeadStatus);
router.delete('/:id', authorize('ADMIN'), deleteLead);

// Notes & Activities
router.post('/:id/notes', [body('content').notEmpty()], validate, addNote);
router.post('/:id/activities', [
  body('type').notEmpty(),
  body('description').notEmpty(),
], validate, logActivity);

module.exports = router;
