const express = require('express');
const { body } = require('express-validator');
const { getTasks, getTaskById, createTask, updateTask, deleteTask, getUpcomingTasks } = require('./task.controller');
const { authenticate } = require('../../middleware/auth');
const validate = require('../../middleware/validate');

const router = express.Router();

router.use(authenticate);

const taskValidation = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('dueDate').isISO8601().withMessage('Valid due date is required'),
  body('leadId').notEmpty().withMessage('Lead ID is required'),
];

router.get('/', getTasks);
router.get('/upcoming', getUpcomingTasks);
router.get('/:id', getTaskById);
router.post('/', taskValidation, validate, createTask);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);

module.exports = router;
