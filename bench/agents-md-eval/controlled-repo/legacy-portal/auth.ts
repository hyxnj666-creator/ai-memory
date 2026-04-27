/**
 * legacy-portal — OAuth client (implicit flow, deprecated).
 *
 * Slated for migration to the conventions in AGENTS.md. Do not extend.
 */

const LEGACY_CLIENT_ID = "legacy-portal-spa-2019";
const LEGACY_AUTHORIZE_URL = "https://idp.example.com/authorize";

export function buildLegacyAuthorizeUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "token",
    client_id: LEGACY_CLIENT_ID,
    redirect_uri: redirectUri,
    state,
    scope: "openid profile email",
  });
  return `${LEGACY_AUTHORIZE_URL}?${params.toString()}`;
}

export function parseFragmentTokens(fragment: string): { access_token: string; expires_in: string } {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  const access_token = params.get("access_token") ?? "";
  const expires_in = params.get("expires_in") ?? "0";
  return { access_token, expires_in };
}
