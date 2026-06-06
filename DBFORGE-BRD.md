# DBForge — Business Requirements & Technical Reference

> **Purpose:** Single reference for revising requirements, planning features, and onboarding developers.  
> **Apps:** `team-erd` (frontend) + `team-erd-api` (backend)  
> **Last updated:** June 2026

---

## 1. Product overview

**DBForge** is an internal company workspace for database design and API documentation. One company, multiple internal teams (Frontend, Backend, Mobile, UI/UX, DevOps, etc.). A **Super Admin** manages users, teams, and all projects.

### Core value
- Visual **ERD whiteboard** (tables, columns, relations)
- **API documentation** (groups, routes, parameters, responses)
- **Team collaboration** (members, roles, comments, activity, invites)
- **Multi-team admin platform** (team assignment, filters, audit, backup)
- **Exports** (SQL, JSON, Markdown, Swagger, Postman)
- **Reports & health** tracking per project and portfolio

### Users & roles

| Level | Role | Capabilities |
|-------|------|--------------|
| Platform | `SUPER_ADMIN` | Full admin console, all teams/projects, user CRUD, audit, backup |
| Platform | `MEMBER` | Normal app access |
| Team | `TEAM_LEAD` | Manage team members & project assignment (within team) |
| Team | `MEMBER` | See team projects |
| Project | `LEADER` | Full project control, settings, delete, permissions |
| Project | `EDITOR` | Edit ERD & API docs |
| Project | `VIEWER` | Read-only project access |
| Project | `COMMENTER` | View + comment |

Team-assigned users get implicit **VIEWER** access to linked projects (without being explicit project members).

---

## 2. Tech stack

### Backend (`team-erd-api`)
| Layer | Technology |
|-------|------------|
| Runtime | Node.js (ESM) |
| Framework | Express 4 |
| ORM | Prisma 6 + MySQL |
| Auth | JWT access + refresh tokens, bcrypt |
| Realtime | Socket.io |
| Email | Nodemailer (SMTP optional) |
| Validation | Zod |
| Tests | Jest |

### Frontend (`team-erd`)
| Layer | Technology |
|-------|------------|
| UI | React 19 |
| Build | Vite 6 |
| Styling | Tailwind CSS 4 |
| Routing | React Router 7 |
| State | Zustand (session, theme, team filter) |
| HTTP | Axios |
| ERD canvas | @xyflow/react |
| Charts | Recharts |
| i18n | i18next (en + ar) |
| Realtime | socket.io-client |
| Tests | Vitest + Testing Library |

### Local dev (Laragon)
- MySQL database: `dbforge`
- API: `http://localhost:4000`
- Frontend: `http://localhost:5173` (proxies `/api` → `:4000`)

---

## 3. Directory structure

### Backend `team-erd-api/`
```
prisma/
  schema.prisma          # All models & enums
  seed.js                # Demo data
  migrations/            # SQL migrations
src/
  app.js                 # Express + Socket.io entry
  config/index.js        # Env config
  middleware/
    auth.js              # JWT requireAuth
    adminAccess.js       # SUPER_ADMIN guard
    projectAccess.js     # Project member + team access
    validate.js          # Zod body/query validation
  modules/
    auth/                # Login, register, refresh, reset
    users/               # GET/PATCH /me
    projects/            # CRUD, members, reports
    erd/                 # Tables, columns, relations
    apiDocs/             # Groups, routes, params, responses
    comments/            # Threaded comments + resolve
    activity/            # Activity feed
    notifications/       # In-app notifications
    export/                # SQL, JSON, MD, Swagger, Postman
    import/                # ERD/API/Swagger/Postman import
    invitations/           # Accept invite
    report/                # Portfolio report
    permissions/           # Fine-grained grants
    admin/                 # Platform admin APIs
    teams/                 # Team CRUD + members + projects
    search/                # Global search
    templates/             # Project templates
    public/                # Public read-only project by slug
  sockets/
    index.js               # Connection, project rooms, user rooms
    emit.js                # emitToProject, emitToUser
  lib/
    prisma.js, tokens.js, email.js, audit.js, userProfile.js
    permissions.js, projectPermissions.js
```

### Frontend `team-erd/`
```
src/
  App.jsx                # All routes
  api/                   # Axios wrappers per domain
  components/
    layout/              # AppLayout, Sidebar, TeamSwitcher, CommandPalette
    admin/               # AdminGuard
    project/             # PermissionsMatrix, etc.
    ui/                  # Button, Card, Input, Badge, etc.
  pages/
    Auth/                # Login, Register, Forgot/Reset password
    Dashboard/           # Pipeline stats
    Projects/            # List + create (teams, templates)
    Project/             # Overview, settings, team, report, health
    ERD/                 # Whiteboard (React Flow)
    API/                 # API docs editor
    Comments/            # Comments + resolve
    Activity/            # Activity feed
    Notifications/       # Notification inbox
    Reports/             # Portfolio report
    Admin/               # Admin console pages
    Teams/               # My teams
    Public/              # Public project read page
    Account/             # Profile + theme toggle
  store/
    useSessionStore.js   # User session
    useTeamStore.js      # Team filter (persisted)
    useThemeStore.js     # Dark/light (persisted)
  realtime/
    projectSocket.js     # Socket.io client
  locales/
    en.json, ar.json     # i18n strings
```

---

## 4. Database schema

### Enums
- `ProjectVisibility`: PRIVATE, PUBLIC
- `ProjectMemberRole`: LEADER, EDITOR, VIEWER, COMMENTER
- `PlatformRole`: SUPER_ADMIN, MEMBER
- `TeamRole`: TEAM_LEAD, MEMBER
- `ErdRelationType`: ONE_TO_ONE, ONE_TO_MANY, MANY_TO_MANY
- `HttpMethod`: GET, POST, PUT, PATCH, DELETE
- `ApiRouteStatus`: DRAFT, STABLE, DEPRECATED
- `ApiParameterLocation`: PATH, QUERY, BODY, HEADER
- `CommentableType`: ERD_TABLE, ERD_RELATION, API_ROUTE
- `PermissionResource`: ERD, API, COMMENTS, EXPORTS
- `PermissionAction`: VIEW, CREATE, EDIT, DELETE

### Models (relationships)

```
User
  ├── projectsLed (Project.leader)
  ├── projectMembers (ProjectMember)
  ├── teamMemberships (TeamMember)
  ├── refreshTokens, passwordResetTokens
  ├── notifications, activityLogs, comments
  ├── adminAudits, templatesCreated, teamsCreated
  └── permissions (ProjectPermission)

Team
  ├── members (TeamMember → User)
  └── projects (TeamProject → Project)

Project
  ├── leader (User)
  ├── members, invitations
  ├── erdTables → ErdColumn
  ├── erdRelations (from/to tables & columns)
  ├── apiGroups → ApiRoute → ApiParameter, ApiRouteResponse
  ├── comments, activityLogs, permissions
  ├── apiTestSettings (per user)
  └── teamProjects (TeamProject → Team)

AdminAuditLog     # Platform admin actions
ProjectTemplate   # erdJson + apiJson starter templates
Notification      # In-app alerts (invite, etc.)
```

---

## 5. API reference

Base URL: `/api`  
Auth: `Authorization: Bearer <accessToken>` unless noted.

### Health (no auth)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health`, `/api/health` | Liveness |
| GET | `/ready`, `/api/ready` | DB readiness |

### Auth `/api/auth`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | No | Create account |
| POST | `/login` | No | Login → user profile + tokens |
| POST | `/refresh` | No | Refresh access token |
| POST | `/forgot-password` | No | Send reset email |
| POST | `/reset-password` | No | Reset with token |
| POST | `/logout` | Yes | Revoke refresh token |

### Users `/api/users`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/me` | Current user (enriched profile) |
| PATCH | `/me` | Update name, avatar |

### Projects `/api/projects`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List projects (`?teamId=` filter) |
| POST | `/` | Create (`name`, `description`, `visibility`, `teamIds[]`) |
| GET | `/:id` | Project detail |
| PUT | `/:id` | Update (leader only) |
| DELETE | `/:id` | Delete (leader only) |
| GET | `/:projectId/report` | Full project report |
| GET | `/:projectId/report/stats` | Report stats |
| GET | `/:projectId/report/tables` | Tables report |
| GET | `/:projectId/report/api` | API report |
| GET | `/:projectId/report/team` | Team report |

### Members `/api/projects/:projectId/members`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List members |
| POST | `/invite` | Invite by email |
| PUT | `/:userId/role` | Change role (leader) |
| DELETE | `/:userId` | Remove member (leader) |

### ERD `/api/projects/:projectId/erd`
| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| GET | `/tables` | VIEWER | List tables |
| POST | `/tables` | EDITOR | Create table |
| PUT | `/tables/:tableId` | EDITOR | Update table |
| DELETE | `/tables/:tableId` | EDITOR | Delete table |
| POST | `/tables/:tableId/columns` | EDITOR | Add column |
| PUT | `/tables/:tableId/columns/:columnId` | EDITOR | Update column |
| DELETE | `/tables/:tableId/columns/:columnId` | EDITOR | Delete column |
| GET | `/relations` | VIEWER | List relations |
| POST | `/relations` | EDITOR | Create relation |
| PUT | `/relations/:relationId` | EDITOR | Update relation |
| DELETE | `/relations/:relationId` | EDITOR | Delete relation |

### API docs `/api/projects/:projectId/api`
| Method | Path | Description |
|--------|------|-------------|
| GET/PUT | `/test-settings` | API tester config |
| GET/POST/PUT/DELETE | `/groups` | API groups |
| POST/PUT/DELETE | `/groups/:groupId/routes` | Routes |
| POST/PUT/DELETE | `/routes/:routeId/parameters` | Parameters |
| POST/PUT/DELETE | `/routes/:routeId/responses` | Responses |

### Comments `/api/projects/:projectId/comments`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List (`?resolved=`, entity filters) |
| POST | `/` | Create comment/reply |
| PUT | `/:commentId/resolve` | Resolve thread |

### Activity `/api/projects/:projectId/activity`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/feed` | Activity log feed |

### Export `/api/projects/:projectId/export`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/sql` | SQL DDL export |
| GET | `/json` | JSON schema export |
| GET | `/markdown` | Markdown export |
| GET | `/swagger` | OpenAPI/Swagger |
| GET | `/postman` | Postman collection |

### Import `/api/projects/:projectId/import`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/erd` | Import ERD JSON |
| POST | `/api` | Import API JSON |
| POST | `/swagger` | Import Swagger |
| POST | `/postman` | Import Postman |
| POST | `/introspect/mysql/preview` | Preview MySQL schema (credentials not stored) |
| POST | `/introspect/mysql` | Introspect MySQL and import ERD |

### Tasks `/api/tasks` (global) & `/api/projects/:projectId/tasks`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tasks/board` | Kanban board (`?projectId=&assigneeId=`) |
| GET | `/api/tasks/stats` | Task stats (`?projectId=`) |
| GET | `/api/projects/:id/tasks` | List project tasks |
| POST | `/api/projects/:id/tasks` | Create task + assign members |
| GET | `/api/projects/:id/tasks/:taskId` | Task detail + progress history |
| PATCH | `/api/projects/:id/tasks/:taskId` | Update status, progress, assignees |
| DELETE | `/api/projects/:id/tasks/:taskId` | Delete task |
| POST | `/api/projects/:id/tasks/:taskId/progress` | Log daily progress `{ progress, note, logDate? }` |
| GET | `/api/projects/:id/report/tasks` | Tasks section in project report |

### AI `/api/projects/:projectId/ai`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/preview` | Generate ERD from app description (preview) |
| POST | `/apply` | Generate and import ERD |

### Permissions `/api/projects/:projectId/permissions`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List grants |
| POST | `/` | Grant permission |
| POST | `/revoke` | Revoke permission |

### Notifications `/api/notifications`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List notifications |
| POST | `/:id/read` | Mark read |

### Invitations `/api/invitations`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/accept` | Accept invite token |

### Report `/api/report`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/portfolio` | All-projects portfolio report |

### Admin `/api/admin` (SUPER_ADMIN only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Platform stats + recent audit |
| GET | `/users` | All users (`?page=&limit=`) |
| POST | `/users` | Create user |
| PATCH | `/users/:userId` | Update user (active, role) |
| GET | `/projects` | All projects (paginated) |
| GET | `/audit` | Audit log (paginated) |
| GET | `/backup` | Full company JSON backup |
| GET | `/email/status` | SMTP configuration status |
| POST | `/email/test` | Send test email `{ to }` |

### Teams `/api/teams`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Teams for current user (admin sees all) |
| POST | `/` | Create team (admin) |
| GET | `/:teamId` | Team detail |
| PUT | `/:teamId` | Update team |
| DELETE | `/:teamId` | Delete team |
| POST | `/:teamId/members` | Add member |
| DELETE | `/:teamId/members/:userId` | Remove member |
| POST | `/:teamId/projects` | Assign project |
| DELETE | `/:teamId/projects/:projectId` | Unassign project |

### Search `/api/search`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/?q=` | Global search (projects, tables, routes, teams, users*) |

### Templates `/api/templates`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List public templates |
| POST | `/:templateId/projects` | Create project from template |

### Public `/api/public` (no auth)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects/:slug` | Read-only PUBLIC project |

---

## 6. Frontend routes

| Path | Page | Auth | Description |
|------|------|------|-------------|
| `/auth/login` | LoginPage | No | Sign in |
| `/auth/register` | RegisterPage | No | Sign up |
| `/auth/forgot-password` | ForgotPasswordPage | No | Request reset |
| `/auth/reset-password` | ResetPasswordPage | No | Reset password |
| `/p/:slug` | PublicProjectPage | No | Public read-only project |
| `/` | DashboardPage | Yes | Pipeline dashboard |
| `/projects` | ProjectsPage | Yes | All projects + create |
| `/teams` | MyTeamsPage | Yes | User's teams |
| `/reports` | AllProjectsReportPage | Yes | Portfolio report |
| `/notifications` | NotificationsPage | Yes | Inbox |
| `/invite` | InviteAcceptPage | Yes | Accept invitation |
| `/account` | AccountPage | Yes | Profile + theme |
| `/admin` | AdminDashboardPage | SUPER_ADMIN | Admin home |
| `/admin/users` | AdminUsersPage | SUPER_ADMIN | User management |
| `/admin/teams` | AdminTeamsPage | SUPER_ADMIN | Team management |
| `/admin/teams/:teamId` | AdminTeamDetailPage | SUPER_ADMIN | Team members & projects |
| `/admin/projects` | AdminProjectsPage | SUPER_ADMIN | All projects table |
| `/admin/audit` | AdminAuditPage | SUPER_ADMIN | Audit log |
| `/projects/:id` | ProjectOverviewPage | Yes | Project home |
| `/projects/:id/whiteboard` | ErdPage | Yes | ERD canvas |
| `/projects/:id/api` | ApiDocsPage | Yes | API documentation |
| `/projects/:id/team` | ProjectTeamPage | Yes | Members & invites |
| `/projects/:id/comments` | CommentsPage | Yes | Comments |
| `/projects/:id/activity` | ActivityPage | Yes | Activity feed |
| `/projects/:id/settings` | ProjectSettingsPage | Yes | Settings + permissions |
| `/projects/:id/report` | ProjectReportPage | Yes | Full report |
| `/projects/:id/health` | ProjectHealthPage | Yes | Health metrics |

**Global UI features (authenticated):**
- Sidebar team filter (`TeamSwitcher`) → filters dashboard & projects
- Command palette `Ctrl+K` → global search
- Dark mode toggle (Account page)
- Realtime notifications on invite

---

## 7. Auth flow

1. **Login** → `POST /api/auth/login` returns `{ user, accessToken, refreshToken }`
2. Frontend stores tokens in `localStorage` (`authStorage.js`)
3. Axios interceptor attaches `Authorization: Bearer <accessToken>`
4. On 401 → refresh via `POST /api/auth/refresh` → retry request
5. **Logout** → `POST /api/auth/logout` + clear storage + disconnect socket
6. User profile includes `platformRole` and `teams[]` after login

---

## 8. Permissions system

### Role hierarchy (project)
`LEADER > EDITOR > COMMENTER > VIEWER`

### Fine-grained overrides
`ProjectPermission` grants extra rights per user per resource (ERD, API, COMMENTS, EXPORTS) and action (VIEW, CREATE, EDIT, DELETE). Managed in **Project Settings → Permissions matrix** (leader only).

### Team access
Users in a team assigned to a project get VIEWER-level access without explicit project membership.

---

## 9. Realtime (Socket.io)

### Client → Server
| Event | Payload | Description |
|-------|---------|-------------|
| `project:join` | `projectId` | Join project room |
| `project:leave` | `projectId` | Leave project room |

### Server → Client
| Event | Description |
|-------|-------------|
| `presence:peer` | User joined whiteboard |
| `presence:left` | User left |
| `project:updated` | Project metadata changed |
| `project:deleted` | Project deleted |
| `members:updated` | Members changed |
| `erd:*` | ERD changes (via emitToProject) |
| `api:*` | API doc changes |
| `comments:*` | Comment changes |
| `notification:new` | New in-app notification (user room) |

User auto-joins `user:{userId}` room on connect for personal notifications.

---

## 10. Environment variables

### Backend `team-erd-api/.env`
```env
NODE_ENV=development
PORT=4000
DATABASE_URL="mysql://root@localhost:3306/dbforge"
JWT_ACCESS_SECRET=dev-access-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret-change-me
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
CORS_ORIGIN=http://localhost:5173
APP_URL=http://localhost:5173

# Optional SMTP
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=DBForge <noreply@localhost>
```

### Frontend `team-erd/.env`
```env
# Local dev: leave VITE_API_BASE_URL unset — Vite proxies /api → :4000
# VITE_API_BASE_URL=https://your-domain.com/api
# VITE_SOCKET_ORIGIN=http://localhost:4000
```

---

## 11. Seed data & test accounts

```bash
cd team-erd-api
npx prisma migrate dev
npm run db:seed
```

| Email | Password | Platform role | Notes |
|-------|----------|---------------|-------|
| admin@team.com | adminabdo123 | SUPER_ADMIN | Team lead on Frontend, Backend, DevOps |
| editor@dbforge.seed | adminabdo123 | MEMBER | Project editor |
| viewer@dbforge.seed | adminabdo123 | MEMBER | Project viewer |
| commenter@dbforge.seed | adminabdo123 | MEMBER | Commenter role |

**Seed includes:**
- 5 teams: Frontend, Backend, Mobile, UI/UX, DevOps
- 1 project: "E-Commerce Platform" (assigned to Backend team)
- 6 ERD tables, 8 relations, 13 API routes
- 1 template: "REST API Starter"
- Comments, activity, notifications, permissions

---

## 12. Local development checklist

```bash
# 1. Start Laragon MySQL

# 2. Backend
cd d:\erd\team-erd-api
npm install
npx prisma migrate dev
npm run db:seed
npm run dev          # → http://localhost:4000

# 3. Frontend
cd d:\erd\team-erd
npm install
npm run dev          # → http://localhost:5173
```

**Important:** Both servers must run. Frontend proxies `/api` to port 4000. If login returns **500**, check that the API is running (`http://localhost:4000/health`).

---

## 13. Implemented features (checklist)

- [x] Auth (register, login, refresh, forgot/reset password)
- [x] Projects CRUD with visibility (PRIVATE/PUBLIC)
- [x] ERD whiteboard (React Flow)
- [x] API documentation editor
- [x] Comments with resolve + filters
- [x] Activity feed
- [x] Notifications (in-app + realtime on invite)
- [x] Member invites (email + in-app)
- [x] Fine-grained permissions matrix
- [x] Export (SQL, JSON, MD, Swagger, Postman)
- [x] Import (ERD, API, Swagger, Postman)
- [x] Project & portfolio reports
- [x] Project health page
- [x] i18n (English + Arabic)
- [x] Multi-team platform (teams, assignment, filter)
- [x] Admin console (users, teams, projects, audit, backup)
- [x] Project templates
- [x] Global search + command palette (Ctrl+K)
- [x] Dark mode
- [x] Public read links (`/p/:slug`)
- [x] Admin API pagination
- [x] MySQL DB introspection import (connect → preview → import ERD)
- [x] AI schema generator (OpenAI or heuristic fallback)
- [x] Admin email status + test send
- [x] Task management (Kanban, assignees, daily progress, project report tab)
- [x] ERD auto-layout (dagre) on whiteboard toolbar
- [x] ERD minimap (pannable/zoomable, bottom-right)
- [x] Online users avatars on whiteboard header
- [x] AI schema generator modal on whiteboard
- [x] Live cursors + ERD snapshots (whiteboard)

---

## 14. Known gaps & future features (BRD backlog)

Use this section for your next revision cycle:

| Priority | Feature | Notes |
|----------|---------|-------|
| ~~High~~ | ~~Admin UI pagination controls~~ | Done — users, projects, audit pages |
| ~~High~~ | ~~Team lead self-service UI~~ | Done — `/teams/:teamId` member management |
| ~~High~~ | ~~Direct user provisioning~~ | Done — admin user detail, project add-member (no invites) |
| ~~High~~ | ~~Email delivery in production~~ | Done — admin email status + test; set SMTP_* in API .env |
| ~~High~~ | ~~MySQL DB introspection import~~ | Done — project overview → Import from MySQL |
| ~~High~~ | ~~AI schema generator~~ | Done — describe app → preview/apply ERD |
| ~~Medium~~ | ~~Notification badge in sidebar~~ | Done — unread count + realtime bump |
| ~~Medium~~ | ~~Template management UI~~ | Done — `/admin/templates` CRUD + save from project |
| ~~Medium~~ | ~~ERD version history / snapshots~~ | Done — save/restore on whiteboard panel |
| ~~Medium~~ | ~~API route live testing~~ | Done — Try it out per route in API docs |
| ~~Medium~~ | ~~Project health automation~~ | Done — auto-persist on activity + manual refresh |
| Low | OAuth / SSO login | Email/password only (skipped — internal provisioning) |
| Low | File attachments on comments | Text only |
| ~~Low~~ | ~~Webhook integrations~~ | Done — project settings webhooks + HMAC |
| ~~Low~~ | ~~Live cursors on whiteboard~~ | Done — Socket.io presence:cursor |
| Low | Multi-language admin UI | i18n partial (admin pages mostly English) |
| Low | Rate limit tuning per route | Global 300/15min only |

---

## 15. Troubleshooting

### Login 500 on `localhost:5173/api/auth/login`

| Cause | Fix |
|-------|-----|
| API not running | Start `npm run dev` in `team-erd-api` |
| API crashed (syntax error) | Check terminal for `Failed running src/app.js` |
| MySQL not running | Start Laragon MySQL |
| DB not migrated | Run `npx prisma migrate dev` + `npm run db:seed` |
| Proxy ECONNREFUSED | Vite cannot reach `:4000` — restart API |

### Verify API is healthy
```
GET http://localhost:4000/health        → { ok: true }
POST http://localhost:4000/api/auth/login
  Body: { "email": "admin@team.com", "password": "adminabdo123" }
```

---

## 16. Tests

```bash
# Backend — 46 tests
cd team-erd-api && npm test

# Frontend — 26 tests
cd team-erd && npm run test:run
```

---

*This document lives at `team-erd-api/DBFORGE-BRD.md`. Update it when adding features or changing APIs.*
