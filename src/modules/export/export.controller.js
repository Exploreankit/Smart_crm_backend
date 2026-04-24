const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');
const prisma = require('../../config/prisma');

/**
 * GET /api/export/leads/csv
 * Export leads to CSV
 */
const exportLeadsCSV = async (req, res, next) => {
  try {
    const where = req.user.role === 'SALESPERSON'
      ? { assignedToId: req.user.id }
      : {};

    const leads = await prisma.lead.findMany({
      where,
      include: {
        assignedTo: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build CSV content
    const csvRows = [
      ['Name', 'Email', 'Phone', 'Company', 'Deal Value', 'Status', 'Temperature', 'Score', 'Assigned To', 'Source', 'Created At'],
      ...leads.map((l) => [
        l.name,
        l.email,
        l.phone || '',
        l.company || '',
        l.dealValue,
        l.status,
        l.temperature,
        l.score,
        l.assignedTo?.name || '',
        l.source || '',
        l.createdAt.toISOString().split('T')[0],
      ]),
    ];

    const csvContent = csvRows.map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.csv"');
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/export/leads/json
 * Export leads as JSON
 */
const exportLeadsJSON = async (req, res, next) => {
  try {
    const where = req.user.role === 'SALESPERSON'
      ? { assignedToId: req.user.id }
      : {};

    const leads = await prisma.lead.findMany({
      where,
      include: {
        assignedTo: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.setHeader('Content-Disposition', 'attachment; filename="leads-export.json"');
    res.json(leads);
  } catch (error) {
    next(error);
  }
};

module.exports = { exportLeadsCSV, exportLeadsJSON };
