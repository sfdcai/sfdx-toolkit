type InsightContext = {
  jobType: string;
  projectName?: string;
  tenantName?: string;
  error?: string | null;
};

const heuristics = [
  { match: /INVALID_TYPE/i, message: "Schema mismatch on metadata. Regenerate the manifest with the proper API version and rerun the retrieve before deploying.", severity: "warning" },
  { match: /UNSUPPORTED_OPERATION/i, message: "The target org has a locked config; verify permissions or remove read-only metadata before retrying.", severity: "warning" },
  { match: /INVALID_CROSS_REFERENCE/i, message: "A referenced metadata component is missing in the target org. Run a diff and include the missing dependency.", severity: "error" }
];

export function generateInsight(context: InsightContext) {
  const error = context.error || "";
  let recommendation = "Check the CLI logs and metadata statuses for more details.";
  let severity: "info" | "warning" | "error" = "info";
  const match = heuristics.find((rule) => rule.match.test(error));
  if (match) {
    recommendation = match.message;
    severity = match.severity as typeof severity;
  } else if (error.includes("permissions")) {
    recommendation = "Verify that the service account/CLI user has permission to deploy the requested metadata.";
    severity = "warning";
  } else if (error.includes("timeout")) {
    recommendation = "Increase the CLI timeout or split the deploy into smaller chunks.";
    severity = "warning";
  }
  const summary = error ? error.split("\n")[0] : `${context.jobType} completed with status queued`;
  return { summary, recommendation, severity };
}
