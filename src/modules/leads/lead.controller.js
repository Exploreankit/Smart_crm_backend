const prisma = require('../../config/prisma');
const { calculateLeadScore } = require('./lead.scoring');

/**
 * Helper: recalculate and persist lead score
 */
const refreshLeadScore = async (leadId) => {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { dealValue: true, interactionCount: true, lastActivityAt: true },
  });
  if (!lead) return;

  const { score, temperature } = calculateLeadScore(lead);
  await prisma.lead.update({
    where: { id: leadId },
    data: { score, temperature },
  });
};

/**
 * GET /api/leads
 * List leads with filtering, sorting, pagination
 */
const getLeads = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      temperature,
      assignedToId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build where clause
    const where = {};
    if (status) where.status = status;
    if (temperature) where.temperature = temperature;

    // Salespersons only see their own leads
    if (req.user.role === 'SALESPERSON') {
      where.assignedToId = req.user.id;
    } else if (assignedToId) {
      where.assignedToId = assignedToId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { [sortBy]: sortOrder },
        include: {
          assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { tasks: true, activities: true, notes: true } },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      leads,
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
 * GET /api/leads/pipeline
 * Get leads grouped by status for Kanban board
 */
const getPipeline = async (req, res, next) => {
  try {
    const where = {};
    if (req.user.role === 'SALESPERSON') {
      where.assignedToId = req.user.id;
    }

    const leads = await prisma.lead.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true, avatar: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { score: 'desc' },
    });

    // Group by status
    const pipeline = {
      NEW: [],
      CONTACTED: [],
      QUALIFIED: [],
      CLOSED: [],
    };

    leads.forEach((lead) => {
      if (pipeline[lead.status]) {
        pipeline[lead.status].push(lead);
      }
    });

    res.json(pipeline);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/leads/:id
 */
const getLeadById = async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
        createdBy: { select: { id: true, name: true } },
        tasks: {
          orderBy: { dueDate: 'asc' },
          include: { user: { select: { id: true, name: true } } },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { user: { select: { id: true, name: true } } },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
      },
    });

    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    // Access control: salesperson can only view assigned leads
    if (req.user.role === 'SALESPERSON' && lead.assignedToId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json(lead);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/leads
 */
const createLead = async (req, res, next) => {
  try {
    const { name, email, phone, company, dealValue, status, source, tags, assignedToId } = req.body;

    const lead = await prisma.lead.create({
      data: {
        name,
        email,
        phone,
        company,
        dealValue: parseFloat(dealValue) || 0,
        status: status || 'NEW',
        source,
        tags: tags || [],
        assignedToId: assignedToId || req.user.id,
        createdById: req.user.id,
        lastActivityAt: new Date(),
        interactionCount: 1,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        type: 'LEAD_CREATED',
        description: `Lead created by ${req.user.name}`,
        leadId: lead.id,
        userId: req.user.id,
      },
    });

    // Calculate initial score
    await refreshLeadScore(lead.id);

    const updatedLead = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: { assignedTo: { select: { id: true, name: true, email: true } } },
    });

    res.status(201).json(updatedLead);
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/leads/:id
 */
const updateLead = async (req, res, next) => {
  try {
    const { name, email, phone, company, dealValue, status, source, tags, assignedToId } = req.body;

    const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Lead not found.' });

    // Track status change for activity log
    const statusChanged = status && status !== existing.status;

    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        name,
        email,
        phone,
        company,
        dealValue: dealValue !== undefined ? parseFloat(dealValue) : undefined,
        status,
        source,
        tags,
        assignedToId,
        lastActivityAt: new Date(),
        interactionCount: { increment: 1 },
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    // Log status change activity
    if (statusChanged) {
      await prisma.activity.create({
        data: {
          type: 'STATUS_CHANGE',
          description: `Status changed from ${existing.status} to ${status}`,
          metadata: { from: existing.status, to: status },
          leadId: lead.id,
          userId: req.user.id,
        },
      });
    }

    // Recalculate score after update
    await refreshLeadScore(lead.id);

    const updatedLead = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: { assignedTo: { select: { id: true, name: true, email: true, avatar: true } } },
    });

    res.json(updatedLead);
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/leads/:id/status
 * Quick status update (used by Kanban drag-and-drop)
 */
const updateLeadStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Lead not found.' });

    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        status,
        lastActivityAt: new Date(),
        interactionCount: { increment: 1 },
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        type: 'STATUS_CHANGE',
        description: `Moved from ${existing.status} to ${status}`,
        metadata: { from: existing.status, to: status },
        leadId: lead.id,
        userId: req.user.id,
      },
    });

    await refreshLeadScore(lead.id);

    res.json(lead);
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/leads/:id
 */
const deleteLead = async (req, res, next) => {
  try {
    await prisma.lead.delete({ where: { id: req.params.id } });
    res.json({ message: 'Lead deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/leads/:id/notes
 */
const addNote = async (req, res, next) => {
  try {
    const { content } = req.body;

    const note = await prisma.note.create({
      data: {
        content,
        leadId: req.params.id,
        userId: req.user.id,
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    // Log activity and update interaction count
    await prisma.$transaction([
      prisma.activity.create({
        data: {
          type: 'NOTE',
          description: `Note added by ${req.user.name}`,
          leadId: req.params.id,
          userId: req.user.id,
        },
      }),
      prisma.lead.update({
        where: { id: req.params.id },
        data: { lastActivityAt: new Date(), interactionCount: { increment: 1 } },
      }),
    ]);

    await refreshLeadScore(req.params.id);

    res.status(201).json(note);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/leads/:id/activities
 * Log a manual activity (call, meeting, email)
 */
const logActivity = async (req, res, next) => {
  try {
    const { type, description } = req.body;

    const activity = await prisma.activity.create({
      data: {
        type,
        description,
        leadId: req.params.id,
        userId: req.user.id,
      },
      include: { user: { select: { id: true, name: true } } },
    });

    // Update lead interaction tracking
    await prisma.lead.update({
      where: { id: req.params.id },
      data: { lastActivityAt: new Date(), interactionCount: { increment: 1 } },
    });

    await refreshLeadScore(req.params.id);

    res.status(201).json(activity);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getLeads,
  getPipeline,
  getLeadById,
  createLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  addNote,
  logActivity,
};
