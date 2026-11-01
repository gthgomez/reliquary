#!/usr/bin/env node
/**
 * Minimal browser regression runner stub — extend with Playwright suites in CI.
 */
const args = process.argv.slice(2);
const suiteIdx = args.indexOf("--suite");
const suite = suiteIdx >= 0 ? args[suiteIdx + 1] : "all";
console.log(`[browser] suite=${suite} (playwright journeys wired separately in scripts/*-qa.mjs)`);
process.exit(0);
