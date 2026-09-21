// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { renderViewer } from '../../src/shared/markdown/render-viewer';
import { enhanceControls } from '../src/controls';

it('renders markdown headings and tables while removing executable content', async () => {
  const html = await renderViewer(
    '# Title\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n<script>alert(1)</script><img src="x" onerror="alert(1)">',
  );
  const node = document.createElement('div');
  node.innerHTML = html;
  expect(node.querySelector('h1')?.textContent).toBe('Title');
  expect(node.querySelectorAll('td')).toHaveLength(2);
  expect(node.querySelector('script, [onerror]')).toBeNull();
});
it('enhanced select keeps the real form value and input events', () => {
  document.body.innerHTML =
    '<label>Category<select name="category"><option value="a">Alpha</option><option value="b">Beta</option></select></label>';
  enhanceControls(document.body);
  document.querySelector<HTMLButtonElement>('.control-trigger')!.click();
  document.querySelector<HTMLButtonElement>('[data-value="b"]')!.click();
  expect(document.querySelector('select')!.value).toBe('b');
  expect(document.querySelector('.control-trigger')!.textContent).toContain('Beta');
});
