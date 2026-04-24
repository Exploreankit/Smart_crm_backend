const prisma = require('../../config/prisma');

/**
 * GET /api/tasks
 * List tasks with optional filters
 */
const getTasks = async (req, res, next) => {
  try {
    const { leadId, status, userId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (leadId) where.leadId = leadId;
    if (status) where.status = status;

    // Salespersons only see their own tasks
    if (req.user.role === 'SALESPERSON') {
      where.userId = req.user.id;
    } else if (userId) {
      where.userId = userId;
    }

    // Auto-mark overdue tasks
    await prisma.task.updateMany({
      where: {
        status: 'PENDING',
        dueDate: { lt: new Date() },
        ...(req.user.role === 'SALESPERSON' ? { userId: req.user.id } : {}),
      },
      data: { status: 'OVERDUE' },
    });

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { dueDate: 'asc' },
        include: {
          lead: { select: { id: true, name: true, company: true } },
          user: { select: { id: true, name: true, avatar: true } },
        },
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      tasks,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tasks/:id
 */
const getTaskById = async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: {
        lead: { select: { id: true, name: true, company: true } },
        user: { select: { id: true, name: true } },
      },
    });

    if (!task) return res.status(404).json({ error: 'Task not found.' });
    res.json(task);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/tasks
 */
const createTask = async (req, res, next) => {
  try {
    const { title, description, dueDate, priority, leadId, userId } = req.body;

    const task = await prisma.task.create({
      data: {
        title,
        description,
        dueDate: new Date(dueDate),
        priority: priority || 'MEDIUM',
        leadId,
        userId: userId || req.user.id,
      },
      include: {
        lead: { select: { id: true, name: true, company: true } },
        user: { select: { id: true, name: true } },
      },
    });

    // Log activity on the lead
    await prisma.activity.create({
      data: {
        type: 'TASK_CREATED',
        description: `Task "${title}" created`,
        leadId,
        userId: req.user.id,
      },
    });

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/tasks/:id
 */
const updateTask = async (req, res, next) => {
  try {
    const { title, description, dueDate, priority, status } = req.body;

    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Task not found.' });

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        priority,
        status,
      },
      include: {
        lead: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    });

    // Log completion activity
    if (status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      await prisma.activity.create({
        data: {
          type: 'TASK_COMPLETED',
          description: `Task "${task.title}" completed`,
          leadId: task.leadId,
          userId: req.user.id,
        },
      });

      // Update lead interaction count
      await prisma.lead.update({
        where: { id: task.leadId },
        data: { lastActivityAt: new Date(), interactionCount: { increment: 1 } },
      });
    }

    res.json(task);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/tasks/:id
 */
const deleteTask = async (req, res, next) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ message: 'Task deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/tasks/upcoming
 * Get tasks due in the next 7 days
 */
const getUpcomingTasks = async (req, res, next) => {
  try {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const where = {
      status: 'PENDING',
      dueDate: { gte: now, lte: nextWeek },
    };

    if (req.user.role === 'SALESPERSON') {
      where.userId = req.user.id;
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: {
        lead: { select: { id: true, name: true, company: true } },
        user: { select: { id: true, name: true } },
      },
    });

    res.json(tasks);
  } catch (error) {
    next(error);
  }
};

module.exports = { getTasks, getTaskById, createTask, updateTask, deleteTask, getUpcomingTasks };
