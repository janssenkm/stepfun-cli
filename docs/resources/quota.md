# Quota Resource

Status: **Unsupported**. The command is registered for discovery and returns `UNSUPPORTED`. Authentication status must not simulate quota information when no authoritative StepFun quota API is available.

## Proposed `quota show`

The command has no local flags. It uses global Region, Base URL, authentication, timeout, and output flags. Text output should distinguish plan limits, usage, remaining allowance, and reset time. JSON output must preserve server field names and units.

Implementation requires a documented StepPlan quota endpoint for both Global and CN Regions.
