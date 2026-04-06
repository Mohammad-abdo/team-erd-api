import {
  generateProjectReport,
  listPortfolioReportSummaries,
} from './report.service.js'
import { asyncHandler } from '../../utils/asyncHandler.js'
import { z } from 'zod'

const querySchema = z.object({
  format: z.enum(['json', 'html', 'markdown']).optional().default('json')
})

export const getPortfolioReport = asyncHandler(async (req, res) => {
  const projects = await listPortfolioReportSummaries(req.user.sub)
  res.json({
    projects,
    generatedAt: new Date().toISOString(),
  })
})

export const getProjectReport = asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const { format } = querySchema.parse(req.query)

  const report = await generateProjectReport(projectId)

  switch (format) {
    case 'html':
      return res.json({ html: generateHtmlReport(report) })
    case 'markdown':
      return res.json({ markdown: generateMarkdownReport(report) })
    default:
      return res.json(report)
  }
})

export const getProjectStats = asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const report = await generateProjectReport(projectId)
  
  return res.json({
    statistics: report.statistics,
    project: report.project
  })
})

export const getProjectTables = asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const report = await generateProjectReport(projectId)
  
  return res.json({
    tables: report.tables,
    tableGroups: report.tableGroups,
    relations: report.relations
  })
})

export const getProjectApi = asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const report = await generateProjectReport(projectId)
  
  return res.json(report.apiDocumentation)
})

export const getProjectTeam = asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const report = await generateProjectReport(projectId)
  
  return res.json(report.team)
})

function generateHtmlReport(report) {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>${report.project.name} - تقرير المشروع</title>
  <style>
    :root {
      --accent-start: #1e4d8c;
      --accent-end: #0d6b6b;
    }
    body { font-family: system-ui, sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; text-align: center; }
    .stat .num { font-size: 2rem; font-weight: bold; color: var(--accent-start); }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
    .card h2 { margin-top: 0; color: var(--accent-start); }
    .table-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
    .table-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
    .table-item h4 { margin: 0 0 8px 0; }
    .table-item .meta { font-size: 12px; color: #64748b; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: bold; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-green { background: #dcfce7; color: #166534; }
  </style>
</head>
<body>
  <h1>📊 ${report.project.name}</h1>
  <p>${report.project.description || ''}</p>
  
  <div class="stat-grid">
    <div class="stat"><div class="num">${report.statistics.tables}</div><div>جداول</div></div>
    <div class="stat"><div class="num">${report.statistics.columns}</div><div>أعمدة</div></div>
    <div class="stat"><div class="num">${report.statistics.relations}</div><div>علاقات</div></div>
    <div class="stat"><div class="num">${report.statistics.apiRoutes}</div><div>مسارات API</div></div>
    <div class="stat"><div class="num">${report.statistics.members}</div><div>أعضاء</div></div>
  </div>
  
  <div class="card">
    <h2>📋 الجداول</h2>
    <div class="table-list">
      ${report.tables.map(t => `
        <div class="table-item">
          <h4>${t.name}</h4>
          <div class="meta">${t.columns.length} أعمدة • ${t.relations.from.length + t.relations.to.length} علاقات</div>
        </div>
      `).join('')}
    </div>
  </div>
  
  <div class="card">
    <h2>🔗 العلاقات</h2>
    <ul>
      ${report.relations.map(r => `<li>${r.fromTable} → ${r.toTable} (${r.type})</li>`).join('')}
    </ul>
  </div>
  
  <div class="card">
    <h2>👥 الفريق</h2>
    <ul>
      ${report.team.members.map(m => `<li>${m.user.name} - ${m.role}</li>`).join('')}
    </ul>
  </div>
  
  <p style="color: #64748b; font-size: 12px;">تم التوليد: ${new Date(report.generatedAt).toLocaleString('ar')}</p>
</body>
</html>
  `.trim()
}

function generateMarkdownReport(report) {
  return `
# 📊 ${report.project.name}

${report.project.description || ''}

## الإحصائيات

| العنصر | العدد |
|--------|-------|
| جداول | ${report.statistics.tables} |
| أعمدة | ${report.statistics.columns} |
| علاقات | ${report.statistics.relations} |
| مسارات API | ${report.statistics.apiRoutes} |
| أعضاء | ${report.statistics.members} |

## 📋 الجداول

${report.tables.map(t => `
### ${t.name}
- الأعمدة: ${t.columns.length}
- العلاقات: ${t.relations.from.length + t.relations.to.length}

| العمود | النوع | PK | FK |
|--------|-------|----|----|
${t.columns.map(c => `| ${c.name} | ${c.dataType} | ${c.isPk ? '✓' : ''} | ${c.isFk ? '✓' : ''} |`).join('\n')}
`).join('\n')}

## 🔗 العلاقات

${report.relations.map(r => `- **${r.fromTable}** → **${r.toTable}** (${r.type})`).join('\n')}

## 👥 الفريق

${report.team.members.map(m => `- ${m.user.name} - ${m.role}`).join('\n')}

---
*تم التوليد: ${new Date(report.generatedAt).toLocaleString('ar')}*
`.trim()
}

export default {
  getPortfolioReport,
  getProjectReport,
  getProjectStats,
  getProjectTables,
  getProjectApi,
  getProjectTeam,
}
