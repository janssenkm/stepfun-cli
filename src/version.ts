/** Package version read from the same manifest used for publishing. */
const packageManifest = require('../package.json') as { version: string };
export const CLI_VERSION = packageManifest.version;

/** Stable client identifier attached to every model API request. */
export const USER_AGENT = `stepfun-cli/${CLI_VERSION}`;
