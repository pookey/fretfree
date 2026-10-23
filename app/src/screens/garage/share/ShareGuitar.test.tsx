import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTER_BUILD } from '../../../engine/garage';
import { renderCard } from './render';
import { ShareGuitar } from './ShareGuitar';

vi.mock('./render', () => ({ renderCard: vi.fn() }));

const renderCardMock = vi.mocked(renderCard);
const share = vi.fn();
let canShare: (data: ShareData) => boolean;

beforeEach(() => {
  renderCardMock.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  share.mockResolvedValue(undefined);
  canShare = () => true;
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  Object.defineProperty(navigator, 'canShare', {
    configurable: true,
    value: (data: ShareData) => canShare(data),
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
  // jsdom has neither, as most desktop browsers lack file sharing.
  delete (navigator as Partial<Navigator>).share;
  delete (navigator as Partial<Navigator>).canShare;
});

function renderShare(achievements: { id: string }[] = [], name = 'My guitar') {
  return render(<ShareGuitar spec={STARTER_BUILD.spec} name={name} achievements={achievements} />);
}

const button = () => screen.getByRole('button', { name: 'Share my guitar' });

describe('<ShareGuitar>', () => {
  it('hands the PNG card to the share sheet', async () => {
    renderShare();
    fireEvent.click(button());
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    const data = share.mock.calls[0]![0] as ShareData;
    const [file] = data.files!;
    expect(file!.name).toBe('fretfree-my-guitar.png');
    expect(file!.type).toBe('image/png');
    expect(data.title).toBe('My guitar');
    expect(data.text).toMatch(/^My guitar, built in FretFree\. http/);
    expect(renderCardMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ name: 'Stratocaster' }) }),
      { name: 'My guitar', model: 'Stratocaster · Red', badges: [], url: 'localhost:3000' },
    );
    await waitFor(() => expect(button()).toBeEnabled());
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('draws the card ahead of the tap, and reuses it', async () => {
    vi.useFakeTimers();
    renderShare();
    expect(renderCardMock).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(renderCardMock).toHaveBeenCalledOnce();
    fireEvent.click(button());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(share).toHaveBeenCalledOnce();
    expect(renderCardMock).toHaveBeenCalledOnce();
  });

  it('offers no badges toggle without badges', () => {
    renderShare();
    expect(screen.queryByRole('checkbox', { name: 'Add my badges' })).not.toBeInTheDocument();
  });

  it('leaves badges off until the learner adds them', async () => {
    renderShare([{ id: 'whole-neck' }]);
    const toggle = screen.getByRole('checkbox', { name: 'Add my badges' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(button());
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(renderCardMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ badges: [] }),
    );

    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    fireEvent.click(button());
    await waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    expect(renderCardMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ badges: ['Whole neck'] }),
    );
  });

  it('says nothing when the share sheet is closed', async () => {
    share.mockRejectedValue(new DOMException('Share cancelled', 'AbortError'));
    const error = vi.spyOn(console, 'error');
    renderShare();
    fireEvent.click(button());
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    await waitFor(() => expect(button()).toBeEnabled());
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(error).not.toHaveBeenCalled();
  });

  it('downloads where files can’t be shared', async () => {
    canShare = () => false;
    URL.createObjectURL = vi.fn(() => 'blob:card');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderShare([], 'Blue Moon');
    fireEvent.click(button());
    expect(await screen.findByRole('status')).toHaveTextContent('Saved fretfree-blue-moon.png.');
    expect(click).toHaveBeenCalledOnce();
    expect(share).not.toHaveBeenCalled();
  });

  it('says so when the card can’t be made, and tries again on the next tap', async () => {
    renderCardMock.mockRejectedValueOnce(new Error('no canvas'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderShare();
    fireEvent.click(button());
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Couldn’t make the picture. Try again.'),
    );
    expect(share).not.toHaveBeenCalled();

    fireEvent.click(button());
    await waitFor(() => expect(share).toHaveBeenCalledOnce());
    expect(renderCardMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
