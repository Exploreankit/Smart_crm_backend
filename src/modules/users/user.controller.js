const bcrypt = require('bcryptjs');
const prisma = require('../../config/prisma');

/**
 * GET /api/users
 * List all users (Admin only)
 */
const getUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        _count: { select: { assignedLeads: true, tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/users/:id
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        _count: { select: { assignedLeads: true, tasks: true } },
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json(user);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/users/:id
 * Update user profile
 */
const updateUser = async (req, res, next) => {
  try {
    const { name, email, role, isActive, avatar } = req.body;

    // Non-admins can only update their own profile
    if (req.user.role !== 'ADMIN' && req.user.id !== req.params.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Only admins can change roles
    const updateData = { name, email, avatar };
    if (req.user.role === 'ADMIN') {
      updateData.role = role;
      updateData.isActive = isActive;
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, avatar: true, isActive: true },
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/users/:id (Admin only)
 */
const deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account.' });
    }

    await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ message: 'User deactivated successfully.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { getUsers, getUserById, updateUser, deleteUser };
