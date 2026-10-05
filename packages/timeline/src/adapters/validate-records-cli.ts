/**
 * validate-records-cli — the @gen/timeline record gate (work order W5 §4).
 *
 * Exits non-zero on any GATING finding (ajv/zod parity breaks, graph
 * invariant breaks, IO errors). Informational spec-example findings
 * (TL-owned spec data, CCR #1) are printed but do not gate this package.
 * Never prints secrets (records carry refs only, lock P8).
 */
import { validateArtifactRecords } from "./ajv-validate.js";

const result = await validateArtifactRecords();
for (const finding of result.findings) {
  const tag = finding.informational === true ? "INFO" : "FAIL";
  console.error(`[${tag}][${finding.kind}] ${finding.source}: ${finding.message}`);
}
console.log(
  `validate-records: ${result.gatingFindings.length === 0 ? "OK" : "FAILED"} ` +
    `(${result.records} records, ${result.specExamples} spec example${result.specExamples === 1 ? "" : "s"}, ` +
    `${result.gatingFindings.length} gating finding${result.gatingFindings.length === 1 ? "" : "s"}, ` +
    `${result.findings.length - result.gatingFindings.length} informational)`,
);
process.exit(result.gatingFindings.length === 0 ? 0 : 1);
