# Smart CRM — Backend

Node.js + Express REST API for the Smart CRM application.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express |
| Database | PostgreSQL 14+ |
| ORM | Prisma |
| Auth | JWT (RS256) |
| Validation | express-validator |

---

## Features

- JWT authentication with refresh tokens
- Role-based access control (Admin / Salesperson)
- Lead CRUD with search, filter, pagination
- Automatic lead scoring engine
- Tasks & follow-ups
- Notes & activity logging
- Analytics & team performance metrics
- CSV export

---

## Project Structure

```
src/
├── app.js                  # Express app setup
├── server.js               # Entry point
├── config/
│   └── prisma.js           # Prisma singleton
├── middleware/
│   ├── auth.js             # JWT authenticate + authorize
│   ├── errorHandler.js     # Global error handler
│   └── validate.js         # express-validator middleware
└── modules/
    ├── users/              # Auth + user management
    ├── leads/              # Lead CRUD + scoring engine
    ├── tasks/              # Task management
    ├── analytics/          # Dashboard + performance metrics
    └── export/             # CSV export
prisma/
├── schema.prisma           # DB schema
├── migrations/             # Migration history
└── seed.js                 # Demo data seeder
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Setup

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT_SECRET

npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

API runs at **http://localhost:3000**.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |
| `PORT` | Server port (default: 3000) |

See `.env.example` for a full template.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Current user |
| GET | `/api/leads` | List leads (paginated, filterable) |
| GET | `/api/leads/pipeline` | Kanban grouped leads |
| POST | `/api/leads` | Create lead |
| PUT | `/api/leads/:id` | Update lead |
| PATCH | `/api/leads/:id/status` | Quick status update |
| DELETE | `/api/leads/:id` | Delete lead (Admin) |
| POST | `/api/leads/:id/notes` | Add note |
| POST | `/api/leads/:id/activities` | Log activity |
| GET | `/api/tasks` | List tasks |
| POST | `/api/tasks` | Create task |
| PUT | `/api/tasks/:id` | Update task |
| GET | `/api/analytics/dashboard` | Dashboard stats |
| GET | `/api/analytics/performance` | Team performance (Admin) |
| GET | `/api/analytics/trends` | Lead trends |
| GET | `/api/export/leads/csv` | Export CSV |

---

## Lead Scoring Algorithm

```
Score (0–100) = Deal Value Score (0–40) + Interaction Score (0–30) + Recency Score (0–30)

Deal Value:    min(dealValue / $100k * 40, 40)
Interactions:  min(count / 10 * 30, 30)
Recency:       30 (today) → 25 (week) → 15 (2 weeks) → 8 (month) → 0 (>30 days)

Temperature:
  🔥 Hot  = score ≥ 70
  ⚠️ Warm = score ≥ 40
  ❄️ Cold = score < 40
```

Score recalculates automatically on every lead update, note, activity, or status change.
