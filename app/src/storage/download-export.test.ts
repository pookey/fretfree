// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FretworkDB } from './db';
import { downloadExport, exportFileName } from './download-export';
import { parseExport } from './export-import';

describe('downloadExport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('names the file by date', () => {
    expect(exportFileName(new Date('2026-10-18T22:00:00Z'))).toBe('fretfree-2026-10-18.json');
  });

  it('downloads the full export as JSON', async () => {
    const db = new FretworkDB(`download-${Math.random()}`);
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      blob = b;
      return 'blob:test';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.href).toBe('blob:test');
      expect(this.download).toBe('fretfree-2026-10-18.json');
    });

    const name = await downloadExport(db, new Date('2026-10-18T09:00:00Z'));

    expect(name).toBe('fretfree-2026-10-18.json');
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    expect(blob?.type).toBe('application/json');
    expect(parseExport(await blob!.text()).exportedAt).toBe('2026-10-18T09:00:00.000Z');
    db.close();
  });
});
