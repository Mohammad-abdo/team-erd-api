/**
 * Compute project health scores and actionable issue codes for the health dashboard.
 * Scores are derived from live project statistics — not static defaults.
 * Issue codes are translated on the frontend via health.issue.* keys.
 */
export function computeProjectHealthDashboard(
  stats,
  openComments,
  validationSummary = null,
  driftSummary = null,
) {
  const hasSchema = stats.tables > 0;
  const hasApi = stats.apiRoutes > 0;
  const hasContent = hasSchema || hasApi;
  const isEmptyShell = stats.tables === 0 && stats.relations === 0;

  const erdScore = hasSchema
    ? Math.min(100, 25 + stats.tables * 10 + stats.relations * 8 + stats.columns * 0.4)
    : 0;

  const apiScore = hasApi
    ? Math.min(100, 20 + stats.apiRoutes * 6 + stats.apiGroups * 10)
    : 0;

  let teamScore = stats.members >= 3 ? 85 : stats.members === 2 ? 60 : stats.members === 1 ? 25 : 0;
  if (!hasSchema) {
    teamScore = Math.round(teamScore * (hasApi ? 0.5 : 0.35));
  } else if (!hasContent) {
    teamScore = Math.round(teamScore * 0.35);
  }

  let docsScore = hasSchema && hasApi
    ? Math.min(100, 70 + stats.tables * 2 + stats.apiRoutes * 2)
    : hasSchema || hasApi
      ? 30
      : 0;

  let collabScore = 20;
  if (openComments > 0) {
    collabScore = Math.max(15, 75 - openComments * 10);
  } else if (hasContent && stats.members > 1) {
    collabScore = 65;
  } else if (hasContent) {
    collabScore = 40;
  }

  const categories = isEmptyShell
    ? [
        { key: "erd", score: 0 },
        { key: "api", score: 0 },
        { key: "team", score: 0 },
        { key: "docs", score: 0 },
        { key: "collab", score: 0 },
      ]
    : [
        { key: "erd", score: Math.round(erdScore) },
        { key: "api", score: Math.round(apiScore) },
        { key: "team", score: Math.round(teamScore) },
        { key: "docs", score: Math.round(docsScore) },
        { key: "collab", score: Math.round(collabScore) },
      ];

  let overall = isEmptyShell
    ? 0
    : Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length);

  if (!isEmptyShell && !hasSchema) {
    overall = Math.min(overall, 35);
  }
  if (validationSummary?.errors > 0) {
    overall = Math.max(0, overall - 10);
  }
  if (validationSummary?.warnings > 0) {
    overall = Math.max(0, overall - 3);
  }

  const issues = [];
  if (stats.tables === 0) {
    issues.push({ code: "NO_TABLES", link: "whiteboard" });
  }
  if (stats.apiRoutes === 0) {
    issues.push({ code: "NO_API_ROUTES", link: "api" });
  }
  if (stats.members < 2) {
    issues.push({ code: "SOLO_PROJECT", link: "team" });
  }
  if (openComments > 3) {
    issues.push({ code: "OPEN_COMMENTS", link: "comments", count: openComments });
  }
  if (validationSummary?.errors > 0) {
    issues.push({ code: "VALIDATION_ERRORS", link: "whiteboard", count: validationSummary.errors });
  }
  if (validationSummary?.warnings > 0) {
    issues.push({ code: "VALIDATION_WARNINGS", link: "whiteboard", count: validationSummary.warnings });
  }
  if (hasSchema && !isEmptyShell && driftSummary && !driftSummary.checked) {
    issues.push({ code: "NO_DRIFT_CHECK", link: "?import=1" });
  }
  if (driftSummary?.checked && driftSummary.inSync === false) {
    issues.push({
      code: "SCHEMA_DRIFT",
      link: "?import=1",
      count: driftSummary.issueCount,
      databaseLabel: driftSummary.databaseLabel,
    });
    overall = Math.max(0, overall - Math.min(15, 5 + Math.floor((driftSummary.issueCount ?? 0) / 2)));
  }

  return { overall, categories, issues, isEmptyShell, drift: driftSummary };
}
