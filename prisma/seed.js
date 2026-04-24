const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@smartcrm.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@smartcrm.com',
      password: adminPassword,
      role: 'ADMIN',
    },
  });

  // Create salesperson
  const salesPassword = await bcrypt.hash('sales123', 12);
  const salesperson = await prisma.user.upsert({
    where: { email: 'sales@smartcrm.com' },
    update: {},
    create: {
      name: 'Jane Smith',
      email: 'sales@smartcrm.com',
      password: salesPassword,
      role: 'SALESPERSON',
    },
  });

  // Create sample leads
  const leads = [
    {
      name: 'John Doe',
      email: 'john@acme.com',
      phone: '+1-555-0101',
      company: 'Acme Corp',
      dealValue: 15000,
      status: 'NEW',
      source: 'Website',
      createdById: admin.id,
      assignedToId: salesperson.id,
    },
    {
      name: 'Sarah Johnson',
      email: 'sarah@techstart.io',
      phone: '+1-555-0102',
      company: 'TechStart',
      dealValue: 45000,
      status: 'CONTACTED',
      source: 'LinkedIn',
      createdById: admin.id,
      assignedToId: salesperson.id,
    },
    {
      name: 'Mike Wilson',
      email: 'mike@globalinc.com',
      phone: '+1-555-0103',
      company: 'Global Inc',
      dealValue: 80000,
      status: 'QUALIFIED',
      source: 'Referral',
      createdById: salesperson.id,
      assignedToId: salesperson.id,
    },
    {
      name: 'Emily Chen',
      email: 'emily@innovate.co',
      phone: '+1-555-0104',
      company: 'Innovate Co',
      dealValue: 25000,
      status: 'CLOSED',
      source: 'Cold Call',
      createdById: salesperson.id,
      assignedToId: admin.id,
    },
    {
      name: 'Robert Brown',
      email: 'robert@ventures.com',
      phone: '+1-555-0105',
      company: 'Brown Ventures',
      dealValue: 120000,
      status: 'QUALIFIED',
      source: 'Conference',
      createdById: admin.id,
      assignedToId: salesperson.id,
    },
  ];

  for (const leadData of leads) {
    const lead = await prisma.lead.create({ data: leadData });

    // Add activity for each lead
    await prisma.activity.create({
      data: {
        type: 'LEAD_CREATED',
        description: `Lead ${lead.name} was created`,
        leadId: lead.id,
        userId: leadData.createdById,
      },
    });

    // Add a note
    await prisma.note.create({
      data: {
        content: `Initial contact with ${lead.name} from ${lead.company}. Interested in our enterprise plan.`,
        leadId: lead.id,
        userId: leadData.createdById,
      },
    });
  }

  console.log('✅ Seed completed!');
  console.log('📧 Admin: admin@smartcrm.com / admin123');
  console.log('📧 Sales: sales@smartcrm.com / sales123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
