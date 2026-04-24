const prisma = require('../../config/prisma');

/**
 * GET /api/analytics/dashboard
 * Main dashboard metrics
 */
const getDashboardStats = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const userFilter = isAdmin ? {} : { assignedToId: req.user.id };

    const [
      totalLeads,
      leadsByStatus,
      leadsByTemperature,
      totalDealValue,
      closedDeals,
      pendingTasks,
      overdueTasks,
      recentActivities,
    ] = await Promise.all([
      // Total leads
      prisma.lead.count({ where: userFilter }),

      // Leads grouped by status
      prisma.lead.groupBy({
        by: ['status'],
        where: userFilter,
        _count: { status: true },
        _sum: { dealValue: true },
      }),

      // Leads grouped by temperature
      prisma.lead.groupBy({
        by: ['temperature'],
        where: userFilter,
        _count: { temperature: true },
      }),

      // Total pipeline value
      prisma.lead.aggregate({
        where: userFilter,
        _sum: { dealValue: true },
      }),

      // Closed deals value
      prisma.lead.aggregate({
        where: { ...userFilter, status: 'CLOSED' },
        _sum: { dealValue: true },
        _count: true,
      }),

      // Pending tasks
      prisma.task.count({
        where: {
          status: 'PENDING',
          ...(isAdmin ? {} : { userId: req.user.id }),
        },
      }),

      // Overdue tasks
      prisma.task.count({
        where: {
          status: 'OVERDUE',
          ...(isAdmin ? {} : { userId: req.user.id }),
        },
      }),

      // Recent activities
      prisma.activity.findMany({
        where: isAdmin ? {} : { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          lead: { select: { id: true, name: true, company: true } },
          user: { select: { id: true, name: true } },
        },
      }),
    ]);

    // Format pipeline stages
    const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'CLOSED'];
    const pipeline = stages.map((stage) => {
      const data = leadsByStatus.find((s) => s.status === stage);
      return {
        stage,
        count: data?._count?.status || 0,
        value: data?._sum?.dealValue || 0,
      };
    });

    // Conversion rate
    const closedCount = closedDeals._count || 0;
    const conversionRate = totalLeads > 0 ? ((closedCount / totalLeads) * 100).toFixed(1) : 0;

    res.json({
      summary: {
        totalLeads,
        totalPipelineValue: totalDealValue._sum.dealValue || 0,
        closedDealsValue: closedDeals._sum.dealValue || 0,
        closedDealsCount: closedCount,
        conversionRate: parseFloat(conversionRate),
        pendingTasks,
        overdueTasks,
      },
      pipeline,
      temperature: leadsByTemperature.map((t) => ({
        temperature: t.temperature,
        count: t._count.temperature,
      })),
      recentActivities,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/performance
 * User performance metrics (Admin only)
 */
const getUserPerformance = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
        assignedLeads: {
          select: {
            status: true,
            dealValue: true,
            score: true,
          },
        },
        tasks: {
          select: { status: true },
        },
      },
    });

    const performance = users.map((user) => {
      const leads = user.assignedLeads;
      const closedLeads = leads.filter((l) => l.status === 'CLOSED');
      const totalValue = leads.reduce((sum, l) => sum + l.dealValue, 0);
      const closedValue = closedLeads.reduce((sum, l) => sum + l.dealValue, 0);
      const avgScore = leads.length > 0
        ? Math.round(leads.reduce((sum, l) => sum + l.score, 0) / leads.length)
        : 0;
      const completedTasks = user.tasks.filter((t) => t.status === 'COMPLETED').length;

      return {
        user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar, role: user.role },
        metrics: {
          totalLeads: leads.length,
          closedLeads: closedLeads.length,
          conversionRate: leads.length > 0
            ? parseFloat(((closedLeads.length / leads.length) * 100).toFixed(1))
            : 0,
          totalPipelineValue: totalValue,
          closedValue,
          avgLeadScore: avgScore,
          completedTasks,
        },
      };
    });

    // Sort by closed value descending
    performance.sort((a, b) => b.metrics.closedValue - a.metrics.closedValue);

    res.json(performance);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/analytics/trends
 * Lead creation trends over time
 */
const getTrends = async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const userFilter = req.user.role === 'SALESPERSON'
      ? { assignedToId: req.user.id }
      : {};

    const leads = await prisma.lead.findMany({
      where: {
        ...userFilter,
        createdAt: { gte: startDate },
      },
      select: { createdAt: true, status: true, dealValue: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const trendMap = {};
    leads.forEach((lead) => {
      const date = lead.createdAt.toISOString().split('T')[0];
      if (!trendMap[date]) {
        trendMap[date] = { date, count: 0, value: 0, closed: 0 };
      }
      trendMap[date].count++;
      trendMap[date].value += lead.dealValue;
      if (lead.status === 'CLOSED') trendMap[date].closed++;
    });

    const trends = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

    res.json(trends);
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboardStats, getUserPerformance, getTrends };
