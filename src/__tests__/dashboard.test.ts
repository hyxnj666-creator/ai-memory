import { describe, it, expect } from "vitest";
import { getDashboardHtml } from "../dashboard/html.js";

describe("getDashboardHtml", () => {
  it("returns valid HTML", () => {
    const html = getDashboardHtml();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("ai-memory");
    expect(html).toContain("</html>");
  });

  it("contains all navigation tabs", () => {
    const html = getDashboardHtml();
    expect(html).toContain("Overview");
    expect(html).toContain("Memories");
    expect(html).toContain("Graph");
    expect(html).toContain("Export");
  });

  it("includes D3.js for graph visualization", () => {
    const html = getDashboardHtml();
    expect(html).toContain("d3.v7.min.js");
  });

  it("includes Tailwind CSS", () => {
    const html = getDashboardHtml();
    expect(html).toContain("tailwindcss");
  });

  it("includes all memory type colors and icons", () => {
    const html = getDashboardHtml();
    expect(html).toContain("decision");
    expect(html).toContain("architecture");
    expect(html).toContain("convention");
    expect(html).toContain("todo");
    expect(html).toContain("issue");
  });

  it("includes API fetch functions", () => {
    const html = getDashboardHtml();
    expect(html).toContain("api('memories')");
    expect(html).toContain("api('stats')");
    expect(html).toContain("api('graph')");
  });

  it("includes export functionality", () => {
    const html = getDashboardHtml();
    expect(html).toContain("exportJson");
    expect(html).toContain("exportObsidian");
    expect(html).toContain("copyAll");
  });
});
