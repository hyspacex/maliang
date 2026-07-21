import { join } from "node:path";
import {
  CodexSubprocessGateway,
  REQUIRED_CODEX_VERSION
} from "@maliang/codex-gateway";

const gateway = new CodexSubprocessGateway({
  jobsRoot: join(process.cwd(), ".maliang-data", "jobs"),
  requiredVersion: REQUIRED_CODEX_VERSION
});

const capability = await gateway.checkCapability();
console.log(JSON.stringify(capability, null, 2));
if (!capability.ready) process.exitCode = 1;
