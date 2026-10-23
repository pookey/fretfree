import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { PrivacyScreen } from '../../privacy/PrivacyScreen';

describe('the privacy policy on sharing', () => {
  it('says sharing is the learner’s choice, made on the device, sent only where they send it', () => {
    render(
      <MemoryRouter>
        <PrivacyScreen />
      </MemoryRouter>,
    );
    const not = within(screen.getByRole('region', { name: 'What we don’t collect' }));
    const line = not.getByText('Sharing your guitar is up to you.').closest('li')!;
    expect(line).toHaveTextContent('Nothing is shared unless you tap “Share my guitar”');
    expect(line).toHaveTextContent(
      'The picture is made on this device and goes only where you send it.',
    );
  });
});
