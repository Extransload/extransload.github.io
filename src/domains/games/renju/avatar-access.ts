const ADMIN_ORIGIN = (
  import.meta.env.PUBLIC_COMMENTS_API_URL?.trim() || 'https://extransload-admin.tmdrbsla123.workers.dev'
).replace(/\/$/, '');
const CHECK_INTERVAL_MS = 60_000;

// Only the server's existing GitHub session can grant this capability.
// URL parameters and browser storage are never used as a role source.
export function observeViewerAccess(onChange: (allowed: boolean) => void) {
  let disposed = false;
  let grantTimer: ReturnType<typeof setTimeout> | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let pending: AbortController | undefined;
  let generation = 0;

  function restrict() {
    clearTimeout(grantTimer);
    onChange(false);
  }

  async function refresh() {
    if (disposed) return;
    const requestId = ++generation;
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    clearTimeout(refreshTimer);
    try {
      const response = await fetch(`${ADMIN_ORIGIN}/api/avatar-viewer/access`, {
        credentials: 'include',
        mode: 'cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      const access = response.ok ? await response.json() : null;
      if (disposed || requestId !== generation) return;
      const remaining = Date.parse(access?.expiresAt) - Date.now();
      clearTimeout(grantTimer);
      if (access?.canRotateFreely === true && Number.isFinite(remaining) && remaining > 0) {
        onChange(true);
        grantTimer = setTimeout(restrict, Math.min(remaining, CHECK_INTERVAL_MS + 5000));
      } else {
        restrict();
      }
    } catch {
      if (!disposed && requestId === generation) restrict();
    } finally {
      clearTimeout(timeout);
      if (!disposed && requestId === generation) {
        refreshTimer = setTimeout(refresh, CHECK_INTERVAL_MS);
      }
    }
  }
  const onFocus = () => {
    if (document.visibilityState === 'visible') void refresh();
  };
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onFocus);
  restrict();
  void refresh();
  return () => {
    disposed = true;
    generation++;
    pending?.abort();
    clearTimeout(grantTimer);
    clearTimeout(refreshTimer);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onFocus);
  };
}
