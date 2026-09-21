import { expect, it, vi } from 'vitest';
import { previewApi } from '../src/preview-api';

it('supports design preview editing without any network requests', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
  try {
    const session = await previewApi.session();
    const report = await previewApi.report('overview', '2026-09-01', '2026-09-08');
    expect(report.totals.totalUsers).toBeGreaterThan(0);
    const original = (await previewApi.posts()).items[0];
    original.title = 'local edit';
    expect((await previewApi.post(original.id)).title).not.toBe('local edit');
    const saved = await previewApi.save(original, session.csrfToken);
    expect(saved.version).toBe(original.version + 1);
    await previewApi.publish({ ...original, version: saved.version }, session.csrfToken, true);
    expect((await previewApi.post(original.id)).status).toBe('draft');
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});
