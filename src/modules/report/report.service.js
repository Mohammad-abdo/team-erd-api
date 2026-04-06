import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../utils/httpError.js'

export async function generateProjectReport(projectId) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      leader: {
        select: { id: true, name: true, email: true, avatar: true }
      },
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true }
          }
        }
      },
      erdTables: {
        include: {
          columns: true,
          relationsFrom: {
            include: {
              toTable: { select: { id: true, name: true } },
              fromColumn: { select: { id: true, name: true } },
              toColumn: { select: { id: true, name: true } }
            }
          },
          relationsTo: {
            include: {
              fromTable: { select: { id: true, name: true } },
              fromColumn: { select: { id: true, name: true } },
              toColumn: { select: { id: true, name: true } }
            }
          },
          createdBy: {
            select: { id: true, name: true }
          }
        },
        orderBy: { name: 'asc' }
      },
      erdRelations: {
        include: {
          fromTable: { select: { id: true, name: true } },
          toTable: { select: { id: true, name: true } },
          fromColumn: { select: { id: true, name: true } },
          toColumn: { select: { id: true, name: true } }
        }
      },
      apiGroups: {
        include: {
          routes: {
            include: {
              parameters: true,
              responses: true
            },
            orderBy: [{ method: 'asc' }, { path: 'asc' }]
          }
        },
        orderBy: { sortOrder: 'asc' }
      },
      activityLogs: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          user: { select: { id: true, name: true, avatar: true } }
        }
      },
      _count: {
        select: {
          members: true,
          erdTables: true,
          erdRelations: true,
          apiGroups: true,
          comments: true
        }
      }
    }
  })

  if (!project) {
    throw new HttpError(404, 'Project not found')
  }

  const report = {
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      visibility: project.visibility,
      createdAt: project.createdAt,
      leader: project.leader
    },

    statistics: {
      tables: project._count.erdTables,
      relations: project._count.erdRelations,
      apiGroups: project._count.apiGroups,
      apiRoutes: project.apiGroups.reduce((acc, group) => acc + group.routes.length, 0),
      members: project._count.members,
      comments: project._count.comments,
      columns: project.erdTables.reduce((acc, table) => acc + table.columns.length, 0)
    },

    tableGroups: generateTableGroups(project.erdTables),
    
    tables: project.erdTables.map(table => ({
      id: table.id,
      name: table.name,
      label: table.label,
      color: table.color || 'gray',
      group: table.groupName,
      x: table.x,
      y: table.y,
      description: table.description,
      columns: table.columns.map(col => ({
        id: col.id,
        name: col.name,
        dataType: col.dataType,
        isPk: col.isPk,
        isFk: col.isFk,
        isNullable: col.isNullable,
        isUnique: col.isUnique,
        defaultValue: col.defaultValue,
        description: col.description
      })),
      relations: {
        from: table.relationsFrom.map(rel => ({
          id: rel.id,
          toTable: rel.toTable.name,
          toTableId: rel.toTableId,
          type: rel.relationType,
          fromColumn: rel.fromColumn?.name,
          toColumn: rel.toColumn?.name,
          label: rel.label
        })),
        to: table.relationsTo.map(rel => ({
          id: rel.id,
          fromTable: rel.fromTable.name,
          fromTableId: rel.fromTableId,
          type: rel.relationType,
          fromColumn: rel.fromColumn?.name,
          toColumn: rel.toColumn?.name,
          label: rel.label
        }))
      },
      createdBy: table.createdBy,
      updatedAt: table.updatedAt
    })),

    relations: project.erdRelations.map(rel => ({
      id: rel.id,
      fromTable: rel.fromTable.name,
      fromTableId: rel.fromTableId,
      toTable: rel.toTable.name,
      toTableId: rel.toTableId,
      type: rel.relationType,
      fromColumn: rel.fromColumn?.name,
      toColumn: rel.toColumn?.name,
      label: rel.label
    })),

    apiDocumentation: {
      groups: project.apiGroups.map(group => ({
        id: group.id,
        name: group.name,
        prefix: group.prefix,
        description: group.description,
        routes: group.routes.map(route => ({
          id: route.id,
          method: route.method,
          path: route.path,
          summary: route.summary,
          description: route.description,
          authRequired: route.authRequired,
          roleRequired: route.roleRequired,
          status: route.status,
          parameters: route.parameters.map(param => ({
            location: param.location,
            name: param.name,
            dataType: param.dataType,
            isRequired: param.isRequired,
            description: param.description,
            example: param.example
          })),
          responses: route.responses.map(resp => ({
            statusCode: resp.statusCode,
            description: resp.description,
            example: resp.exampleJson
          }))
        }))
      })),
      summary: generateApiSummary(project.apiGroups)
    },

    team: {
      members: project.members.map(member => ({
        id: member.id,
        user: member.user,
        role: member.role,
        joinedAt: member.joinedAt
      })),
      roles: generateRolesSummary(project.members)
    },

    recentActivity: project.activityLogs.map(log => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      user: log.user,
      createdAt: log.createdAt,
      changes: {
        old: log.oldValues,
        new: log.newValues
      }
    })),

    generatedAt: new Date().toISOString()
  }

  return report
}

function generateTableGroups(tables) {
  const groups = {}
  
  tables.forEach(table => {
    const groupName = table.groupName || 'uncategorized'
    if (!groups[groupName]) {
      groups[groupName] = {
        name: groupName,
        tables: [],
        totalColumns: 0,
        colors: []
      }
    }
    groups[groupName].tables.push(table.name)
    groups[groupName].totalColumns += table.columns.length
    if (table.color && !groups[groupName].colors.includes(table.color)) {
      groups[groupName].colors.push(table.color)
    }
  })

  return Object.values(groups)
}

function generateApiSummary(groups) {
  const summary = {
    total: 0,
    byMethod: { GET: 0, POST: 0, PUT: 0, PATCH: 0, DELETE: 0 },
    byStatus: { DRAFT: 0, STABLE: 0, DEPRECATED: 0 },
    byAuth: { public: 0, authenticated: 0, roleBased: 0 }
  }

  groups.forEach(group => {
    group.routes.forEach(route => {
      summary.total++
      summary.byMethod[route.method]++
      summary.byStatus[route.status]++
      if (!route.authRequired) {
        summary.byAuth.public++
      } else if (route.roleRequired) {
        summary.byAuth.roleBased++
      } else {
        summary.byAuth.authenticated++
      }
    })
  })

  return summary
}

function generateRolesSummary(members) {
  const roles = {}
  members.forEach(member => {
    if (!roles[member.role]) {
      roles[member.role] = {
        role: member.role,
        count: 0,
        users: []
      }
    }
    roles[member.role].count++
    roles[member.role].users.push(member.user)
  })
  return Object.values(roles)
}

/**
 * Lightweight summaries for every project the user is a member of (dashboard / portfolio report).
 */
export async function listPortfolioReportSummaries(userId) {
  const memberships = await prisma.projectMember.findMany({
    where: { userId },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          visibility: true,
          createdAt: true,
          _count: {
            select: {
              erdTables: true,
              erdRelations: true,
              members: true,
              comments: true,
            },
          },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
  })

  const projectIds = memberships.map((m) => m.project.id)
  if (projectIds.length === 0) {
    return []
  }

  const apiGroups = await prisma.apiGroup.findMany({
    where: { projectId: { in: projectIds } },
    select: {
      projectId: true,
      _count: { select: { routes: true } },
    },
  })

  const apiRoutesByProject = {}
  for (const g of apiGroups) {
    apiRoutesByProject[g.projectId] =
      (apiRoutesByProject[g.projectId] || 0) + g._count.routes
  }

  const erdMeta = await prisma.erdTable.findMany({
    where: { projectId: { in: projectIds } },
    select: {
      projectId: true,
      groupName: true,
      _count: { select: { columns: true } },
    },
  })

  const columnsByProject = {}
  const distinctGroupsByProject = {}
  for (const row of erdMeta) {
    columnsByProject[row.projectId] =
      (columnsByProject[row.projectId] || 0) + row._count.columns
    const g = row.groupName?.trim() || null
    if (g) {
      if (!distinctGroupsByProject[row.projectId]) {
        distinctGroupsByProject[row.projectId] = new Set()
      }
      distinctGroupsByProject[row.projectId].add(g)
    }
  }

  return memberships.map((m) => {
    const p = m.project
    const groupCount = distinctGroupsByProject[p.id]?.size ?? 0
    return {
      project: {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        visibility: p.visibility,
        createdAt: p.createdAt,
      },
      myRole: m.role,
      statistics: {
        tables: p._count.erdTables,
        columns: columnsByProject[p.id] ?? 0,
        relations: p._count.erdRelations,
        apiRoutes: apiRoutesByProject[p.id] ?? 0,
        members: p._count.members,
        comments: p._count.comments,
        tableGroupCount: groupCount,
      },
    }
  })
}

export default { generateProjectReport, listPortfolioReportSummaries }
