/**
 * Safe, bounded redirect target resolution for the private KL ERP test.
 * Never pass redirects to an arbitrary host or send university cookies over HTTP.
 * The Location header, query, cookies and tokens must never be exposed in diagnostics.
 */
const ERP_HOST = 'newerp.kluniversity.in';

export type RedirectError = 'missing_location' | 'invalid_location' | 'external_location' | 'unexpected_path';
export type RedirectResult =
  | { ok: true; url: string; kind: 'index' | 'root'; upgradedHttps: boolean }
  | { ok: false; reason: RedirectError };

export function resolveERPRedirect(location: string | null, base: string): RedirectResult {
  if (!location || !location.trim()) return { ok: false, reason: 'missing_location' };
  if (location.length > 2048 || /[\x00-\x1F\x7F]/.test(location)) {
    return { ok: false, reason: 'invalid_location' };
  }

  try {
    const target = new URL(location, base);
    // Require the exact expected ERP hostname; no credentials or unusual ports.
    if (target.hostname.toLowerCase() !== ERP_HOST || target.username || target.password) {
      return { ok: false, reason: 'external_location' };
    }
    const upgradedHttps = target.protocol === 'http:' && !target.port;
    if (upgradedHttps) target.protocol = 'https:';
    if (target.protocol !== 'https:' || target.port) {
      return { ok: false, reason: 'external_location' };
    }
    // The only expected NewERP landing paths from the observed login flow.
    if (target.pathname !== '/index.php' && target.pathname !== '/') {
      return { ok: false, reason: 'unexpected_path' };
    }
    target.hash = '';
    return {
      ok: true,
      url: target.toString(),
      kind: target.pathname === '/' ? 'root' : 'index',
      upgradedHttps,
    };
  } catch {
    return { ok: false, reason: 'invalid_location' };
  }
}
