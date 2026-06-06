import { describe, test, expect } from "@jest/globals";
import { formatCustomReportMarkdown } from "../../src/modules/analytics/customReport.service.js";

describe("customReport helpers", () => {
  test("formatCustomReportMarkdown renders sections", () => {
    const md = formatCustomReportMarkdown({
      definition: { name: "Weekly portfolio", description: "Ops summary" },
      generatedAt: "2026-06-06T12:00:00.000Z",
      sections: {
        projects: { count: 2, items: [{ name: "Alpha", slug: "alpha", visibility: "PRIVATE" }] },
        tasks: { total: 5, open: 2, done: 3 },
      },
    });
    expect(md).toContain("# Weekly portfolio");
    expect(md).toContain("Ops summary");
    expect(md).toContain("## projects");
    expect(md).toContain("Alpha");
    expect(md).toContain("Total: **5**");
  });
});
