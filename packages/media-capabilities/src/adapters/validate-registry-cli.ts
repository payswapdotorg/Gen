/**
 * Gate CLI: `pnpm --filter @gen/media-capabilities validate`.
 * Runs the ajv/zod registry harness; non-zero exit on any finding.
 */
import { validateRegistry } from "./ajv-validate.js";

const result = await validateRegistry();
for (const finding of result.findings) {
  console.error(`error [${finding.kind}] ${finding.source}: ${finding.message}`);
}
console.log(
  `validate-registry: ${result.findings.length === 0 ? "OK" : "FAILED"} ` +
    `(${result.descriptors} descriptors, ${result.scenarios} scenario refs checked)`,
);
process.exitCode = result.findings.length === 0 ? 0 : 1;
