// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, shareOrDownload } from './deliver';

const file = new File(['png'], 'fretfree-my-guitar.png', { type: 'image/png' });
const message = { title: 'My guitar', text: 'My guitar, built in FretFree.' };

describe('shareOrDownload', () => {
  it('shares the file where files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();
    const outcome = await shareOrDownload(file, message, { share, canShare: () => true }, download);
    expect(outcome).toBe('shared');
    expect(share).toHaveBeenCalledWith({ files: [file], ...message });
    expect(download).not.toHaveBeenCalled();
  });

  it('treats a closed share sheet as a choice, not an error', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancel', 'AbortError'));
    const download = vi.fn();
    expect(await shareOrDownload(file, message, { share, canShare: () => true }, download)).toBe(
      'cancelled',
    );
    expect(download).not.toHaveBeenCalled();
  });

  it('downloads when the share is refused for want of a fresh tap', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    const download = vi.fn();
    expect(await shareOrDownload(file, message, { share, canShare: () => true }, download)).toBe(
      'downloaded',
    );
    expect(download).toHaveBeenCalledWith(file, 'fretfree-my-guitar.png');
  });

  it('passes any other failure on', async () => {
    const share = vi.fn().mockRejectedValue(new TypeError('bad data'));
    await expect(
      shareOrDownload(file, message, { share, canShare: () => true }, vi.fn()),
    ).rejects.toThrow('bad data');
  });

  it.each([
    ['no Web Share', {}],
    ['no file sharing', { share: vi.fn(), canShare: () => false }],
    ['share without canShare', { share: vi.fn() }],
    [
      'a canShare that throws',
      {
        share: vi.fn(),
        canShare: () => {
          throw new TypeError('nope');
        },
      },
    ],
  ])('downloads with %s', async (_label, nav) => {
    const download = vi.fn();
    expect(await shareOrDownload(file, message, nav, download)).toBe('downloaded');
    expect(download).toHaveBeenCalledOnce();
  });
});

describe('downloadBlob', () => {
  afterEach(() => vi.restoreAllMocks());

  it('clicks a temporary link to the blob, then frees it', () => {
    URL.createObjectURL = vi.fn(() => 'blob:card');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.href).toBe('blob:card');
      expect(this.download).toBe('card.png');
    });
    downloadBlob(file, 'card.png');
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:card');
  });
});
