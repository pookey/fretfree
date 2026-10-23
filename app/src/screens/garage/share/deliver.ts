/**
 * Hand the card to the learner (design §3.8 sharing): the share sheet where
 * the browser can share files (iPadOS and iOS Safari), a download elsewhere.
 * Either way the file goes only where the learner sends it.
 */

export type ShareOutcome = 'shared' | 'cancelled' | 'downloaded';

export interface ShareMessage {
  title: string;
  text: string;
}

type ShareNavigator = Pick<Navigator, 'share' | 'canShare'>;

/** Save `blob` as `name` through a temporary link, as Settings' export does. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function canShareFiles(nav: Partial<ShareNavigator>, file: File): boolean {
  try {
    return typeof nav.share === 'function' && nav.canShare?.({ files: [file] }) === true;
  } catch {
    return false;
  }
}

const isNamed = (e: unknown, name: string) =>
  typeof e === 'object' && e !== null && (e as { name?: unknown }).name === name;

/**
 * Share `file`, or download it where sharing files isn't possible. Closing
 * the share sheet is the learner's choice, not an error. A share refused for
 * want of a fresh tap (`NotAllowedError`) falls back to the download.
 */
export async function shareOrDownload(
  file: File,
  message: ShareMessage,
  nav: Partial<ShareNavigator> = navigator,
  download: (blob: Blob, name: string) => void = downloadBlob,
): Promise<ShareOutcome> {
  if (canShareFiles(nav, file)) {
    try {
      await nav.share!({ files: [file], ...message });
      return 'shared';
    } catch (e) {
      if (isNamed(e, 'AbortError')) return 'cancelled';
      if (!isNamed(e, 'NotAllowedError')) throw e;
    }
  }
  download(file, file.name);
  return 'downloaded';
}
