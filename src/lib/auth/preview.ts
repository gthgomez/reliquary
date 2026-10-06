/**
 * Shared LIVE-PREVIEW OAuth client (server-only — NEVER import from the client).
 *
 * The sandbox serves each live preview on a dynamic `https://*.grok-sandbox.com`
 * URL, which can't be pre-registered per app. The broker instead exposes ONE
 * shared "preview" client that accepts any
 * `https://*.grok-sandbox.com/api/auth/oauth2/callback/*`
 * (broker: `app-builder-deployer/auth/src/preview-oauth.ts`). Baking the client
 * id here lets the live preview do REAL sign-in — no demo/mock users — with no
 * platform injection. When deployed the deployer injects a per-app
 * `GROK_AUTH_*` that overrides these (see `server.ts`).
 *
 * The client SECRET is never baked into the repo: it is read from
 * `GROK_AUTH_CLIENT_SECRET` (deployer-injected when deployed). Resolution is
 * fail-closed — production (`NODE_ENV=production`) throws at import when the
 * env var is missing; only non-production gets a local-only development
 * fallback (with a warning). This is a dedicated, low-privilege client
 * (preview-only, `*.grok-sandbox.com`) — rotate it by regenerating the
 * broker env var and the deployer's `GROK_AUTH_CLIENT_SECRET` together.
 */
export const PREVIEW_CLIENT_ID = "grok_preview";

/**
 * Local-only fallback for the preview client secret. This is NOT the broker's
 * real secret — real preview sign-in requires `GROK_AUTH_CLIENT_SECRET` to be
 * set. It exists so `npm run dev` keeps a working auth code path (with a
 * warning) without a credential living in the repo.
 */
const DEV_ONLY_PREVIEW_CLIENT_SECRET = "dev-only-preview-client-secret";

/**
 * Resolve the OAuth client secret for the shared preview client.
 *
 * Fail-closed: production (`NODE_ENV=production`) REQUIRES
 * `GROK_AUTH_CLIENT_SECRET` and throws without it — a hardcoded secret must
 * never be the production fallback. Non-production (local dev) falls back to a
 * local-only placeholder with a warning so the dev code path stays intact.
 * Empty/whitespace env vars count as unset.
 */
export function resolvePreviewClientSecret(): string {
  const fromEnv = process.env.GROK_AUTH_CLIENT_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[auth] GROK_AUTH_CLIENT_SECRET is not set — production requires the " +
        "deployer-injected preview OAuth client secret; refusing to fall back " +
        "to a hardcoded value.",
    );
  }
  console.warn(
    "[auth] GROK_AUTH_CLIENT_SECRET is not set — using the development-only " +
      "preview client secret placeholder. Set the env var to exercise real " +
      "preview sign-in (see src/lib/auth/preview.ts).",
  );
  return DEV_ONLY_PREVIEW_CLIENT_SECRET;
}

/** The shared auth broker issuer (OIDC discovery lives under it). */
export const GROK_ISSUER_DEFAULT = "https://auth.grok.me";

/**
 * Host patterns whose callbacks the preview client accepts. Better Auth derives
 * the live preview's real origin from the request host and validates it against
 * this list (wildcard-matched), so the OAuth `redirect_uri` becomes the concrete
 * `https://<preview-host>/api/auth/oauth2/callback/...` the broker allows.
 */
export const PREVIEW_ALLOWED_HOSTS = ["*.grok-sandbox.com"] as const;
