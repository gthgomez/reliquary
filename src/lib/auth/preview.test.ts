import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PREVIEW_CLIENT_ID,
  resolvePreviewClientSecret,
} from "./preview.ts";

/**
 * Fail-closed tests for the shared preview OAuth client secret resolution.
 *
 * The real preview client secret must never live in the repo — production
 * requires the deployer-injected `GROK_AUTH_CLIENT_SECRET` and throws without
 * it; only non-production gets a local-only development fallback (with a
 * warning). These tests pin all three behaviors.
 */
describe("resolvePreviewClientSecret", () => {
  const SECRET_ENV_KEY = "GROK_AUTH_CLIENT_SECRET";

  /**
   * Run `fn` with a controlled `NODE_ENV` / `GROK_AUTH_CLIENT_SECRET`, restoring
   * both afterwards. `undefined` entries delete the variable entirely so the
   * "unset" cases are exercised for real.
   */
  function withEnv(
    options: { nodeEnv?: string; secret?: string },
    fn: () => void,
  ): void {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedSecret = process.env[SECRET_ENV_KEY];
    if (options.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = options.nodeEnv;
    if (options.secret === undefined) delete process.env[SECRET_ENV_KEY];
    else process.env[SECRET_ENV_KEY] = options.secret;
    try {
      fn();
    } finally {
      if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedNodeEnv;
      if (savedSecret === undefined) delete process.env[SECRET_ENV_KEY];
      else process.env[SECRET_ENV_KEY] = savedSecret;
    }
  }

  it("production throws without the env var (fail-closed)", () => {
    withEnv({ nodeEnv: "production" }, () => {
      assert.throws(
        () => resolvePreviewClientSecret(),
        (err: unknown) =>
          err instanceof Error &&
          err.message.includes("GROK_AUTH_CLIENT_SECRET"),
      );
    });
  });

  it("production throws when the env var is empty or whitespace", () => {
    withEnv({ nodeEnv: "production", secret: "   " }, () => {
      assert.throws(() => resolvePreviewClientSecret(), /GROK_AUTH_CLIENT_SECRET/);
    });
  });

  it("development falls back to the local-only placeholder with a warning", () => {
    withEnv({ nodeEnv: "development" }, () => {
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(" "));
      };
      try {
        const secret = resolvePreviewClientSecret();
        assert.ok(secret.length > 0);
        assert.ok(
          warnings.some((w) => w.includes("GROK_AUTH_CLIENT_SECRET")),
          "expected a warning naming GROK_AUTH_CLIENT_SECRET",
        );
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  it("production works with the env var set", () => {
    withEnv({ nodeEnv: "production", secret: "deployer-injected-secret" }, () => {
      assert.equal(resolvePreviewClientSecret(), "deployer-injected-secret");
    });
  });

  it("the env var wins in development too (no fallback, no warning)", () => {
    withEnv({ nodeEnv: "development", secret: "locally-set-secret" }, () => {
      const warnings: string[] = [];
      const originalWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(" "));
      };
      try {
        assert.equal(resolvePreviewClientSecret(), "locally-set-secret");
        assert.deepEqual(warnings, []);
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  it("exposes the shared preview client id (not a secret)", () => {
    assert.equal(PREVIEW_CLIENT_ID, "grok_preview");
  });
});
