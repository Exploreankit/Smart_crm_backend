const express = require('express');
const { getUsers, getUserById, updateUser, deleteUser } = require('./user.controller');
const { authenticate, authorize } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', authorize('ADMIN'), getUsers);
router.get('/:id', getUserById);
router.put('/:id', updateUser);
router.delete('/:id', authorize('ADMIN'), deleteUser);

module.exports = router;
