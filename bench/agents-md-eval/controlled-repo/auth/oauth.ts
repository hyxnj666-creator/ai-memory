/**
 * Customer portal SPA — OAuth client.
 *
 * Greenfield. No flow has been wired in yet. The auth review has signed off
 * on a target flow (see AGENTS.md). Implementations should land here.
 */

export interface OAuthConfig {
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
}

export async function startLogin(_cfg: OAuthConfig): Promise<never> {
  throw new Error("startLogin not implemented yet");
}

export async function handleCallback(_cfg: OAuthConfig, _params: URLSearchParams): Promise<never> {
  throw new Error("handleCallback not implemented yet");
}
