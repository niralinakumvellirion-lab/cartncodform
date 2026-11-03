/**
 * Reviews settings screen (jsdom + React Testing Library). apiGet / apiSend are mocked.
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import Reviews from '../app/admin/screens/Reviews';

const SHOP = 'test.myshopify.com';

function settings(over = {}) {
  return {
    whoCanReview: 'verified',
    verifiedBadge: true,
    starRating: true,
    starRequired: true,
    reviewsPerPage: 10,
    photos: { enabled: true, maxPhotos: 3, maxFileSizeMb: 5, allowedTypes: ['jpeg', 'png', 'webp'] },
    helpfulVotes: true,
    requireApproval: true,
    ...over,
  };
}

async function renderScreen(s = settings()) {
  apiGet.mockResolvedValue({ settings: s });
  render(<Reviews shop={SHOP} />);
  await screen.findByRole('radiogroup', { name: 'Who can leave reviews' });
}

const sw = (name) => screen.getByRole('switch', { name });

beforeEach(() => {
  jest.clearAllMocks();
  window.innerWidth = 1200;
});

describe('loading', () => {
  it('fetches the settings for the shop', async () => {
    await renderScreen();
    expect(apiGet).toHaveBeenCalledWith(`/api/reviews/${SHOP}/settings`);
  });

  it('shows an error when loading fails', async () => {
    apiGet.mockRejectedValue(new Error('Network down'));
    render(<Reviews shop={SHOP} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
  });

  it('does not fetch without a shop', () => {
    render(<Reviews shop="" />);
    expect(apiGet).not.toHaveBeenCalled();
  });
});

describe('every option is on the screen with a one-line description', () => {
  it('shows all titles and their info lines', async () => {
    await renderScreen();
    for (const text of [
      'Who can leave reviews', 'Verified buyers only', 'Logged-in users', 'Anyone',
      'Show “Verified owner” badge', 'Enable star rating', 'Star rating required', 'Reviews per page',
      'Photo reviews', 'Max photos per review', 'Max file size', 'Allowed file types', 'Helpful vote',
    ]) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    // shown in the option row and again in the preview
    expect(screen.getAllByText('Only customers who bought this product can write a review.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Adds a green badge next to reviews written by customers who bought the product.')).toBeInTheDocument();
    expect(screen.getByText('The most photos one customer can add to a single review.')).toBeInTheDocument();
  });

  it('shows the four file types', async () => {
    await renderScreen();
    for (const label of ['JPEG files', 'PNG files', 'GIF files', 'WEBP files']) {
      expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument();
    }
  });

  it('has an On/Off switch for each yes-no option', async () => {
    await renderScreen();
    for (const name of ['Show verified owner badge', 'Enable star rating', 'Star rating required', 'Allow photos in reviews', 'Helpful vote']) {
      expect(sw(name)).toBeInTheDocument();
    }
  });
});

describe('moderation', () => {
  it('has an "Approve reviews first" switch that follows the saved value', async () => {
    await renderScreen(settings({ requireApproval: false }));
    expect(sw('Approve reviews first')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('New reviews appear right away.')).toBeInTheDocument();
    fireEvent.click(sw('Approve reviews first'));
    expect(sw('Approve reviews first')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('New reviews wait for your approval.')).toBeInTheDocument();
  });

  it('sends the choice when saving', async () => {
    await renderScreen();
    fireEvent.click(sw('Approve reviews first'));
    apiSend.mockResolvedValue({ settings: settings({ requireApproval: false }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
    expect(apiSend.mock.calls[0][2].settings.requireApproval).toBe(false);
  });

  it('treats an older response without the field as "approval on"', async () => {
    const old = settings();
    delete old.requireApproval;
    await renderScreen(old);
    expect(sw('Approve reviews first')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('who can leave reviews (radio buttons)', () => {
  it('shows three radios with the saved one selected', async () => {
    await renderScreen(settings({ whoCanReview: 'logged_in' }));
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Logged-in users' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Verified buyers only' })).not.toBeChecked();
  });

  it('only one can be selected at a time', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('radio', { name: 'Anyone' }));
    expect(screen.getByRole('radio', { name: 'Anyone' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Verified buyers only' })).not.toBeChecked();
  });
});

describe('switches and dependent options', () => {
  it('shows On / Off beside the switch', async () => {
    await renderScreen(settings({ verifiedBadge: false }));
    expect(sw('Show verified owner badge')).toHaveAttribute('aria-checked', 'false');
    expect(sw('Enable star rating')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw('Show verified owner badge'));
    expect(sw('Show verified owner badge')).toHaveAttribute('aria-checked', 'true');
  });

  it('star rating off disables and clears "required"', async () => {
    await renderScreen();
    expect(sw('Star rating required')).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw('Enable star rating'));
    expect(sw('Star rating required')).toBeDisabled();
    expect(sw('Star rating required')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Turn on star rating first.')).toBeInTheDocument();
  });

  it('star rating off saves "required" as off, and it stays off when stars come back', async () => {
    await renderScreen();
    fireEvent.click(sw('Enable star rating'));
    fireEvent.click(sw('Enable star rating'));
    expect(sw('Star rating required')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw('Enable star rating'));
    apiSend.mockResolvedValue({ settings: settings({ starRating: false, starRequired: false }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
    expect(apiSend.mock.calls[0][2].settings).toMatchObject({ starRating: false, starRequired: false });
  });

  it('reviews per page is a dropdown', async () => {
    await renderScreen();
    const select = screen.getByRole('combobox', { name: 'Reviews per page' });
    expect(select).toHaveValue('10');
    fireEvent.change(select, { target: { value: '25' } });
    expect(select).toHaveValue('25');
  });
});

describe('photo reviews sub-options', () => {
  it('stay visible but disabled when photos are off', async () => {
    await renderScreen(settings({ photos: { enabled: false, maxPhotos: 3, maxFileSizeMb: 5, allowedTypes: ['jpeg'] } }));
    expect(screen.getByRole('combobox', { name: 'Max photos per review' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Max file size' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'GIF files' })).toBeDisabled();
    fireEvent.click(sw('Allow photos in reviews'));
    expect(screen.getByRole('combobox', { name: 'Max photos per review' })).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'GIF files' })).toBeEnabled();
  });

  it('reflect the saved values and can be changed', async () => {
    await renderScreen();
    expect(screen.getByRole('combobox', { name: 'Max photos per review' })).toHaveValue('3');
    expect(screen.getByRole('combobox', { name: 'Max file size' })).toHaveValue('5');
    expect(screen.getByRole('checkbox', { name: 'JPEG files' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'GIF files' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'GIF files' }));
    expect(screen.getByRole('checkbox', { name: 'GIF files' })).toBeChecked();
    fireEvent.change(screen.getByRole('combobox', { name: 'Max file size' }), { target: { value: '8' } });
    expect(screen.getByRole('combobox', { name: 'Max file size' })).toHaveValue('8');
  });
});

describe('saving', () => {
  it('Save is disabled until something changes', async () => {
    await renderScreen();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('No changes.')).toBeInTheDocument();
    fireEvent.click(sw('Helpful vote'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
  });

  it('sends the whole settings object with PUT, then shows Saved', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('radio', { name: 'Anyone' }));
    fireEvent.click(sw('Helpful vote'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'GIF files' }));
    apiSend.mockResolvedValue({ settings: settings({ whoCanReview: 'anyone', helpfulVotes: false, photos: { enabled: true, maxPhotos: 3, maxFileSizeMb: 5, allowedTypes: ['jpeg', 'png', 'gif', 'webp'] } }) });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledTimes(1));
    const [url, method, body] = apiSend.mock.calls[0];
    expect(url).toBe(`/api/reviews/${SHOP}/settings`);
    expect(method).toBe('PUT');
    expect(body.settings).toMatchObject({ whoCanReview: 'anyone', helpfulVotes: false, starRating: true, reviewsPerPage: 10 });
    expect(body.settings.photos.allowedTypes).toEqual(expect.arrayContaining(['jpeg', 'png', 'webp', 'gif']));
    expect(await screen.findByText('✓ Saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the server message when saving fails and keeps the changes', async () => {
    await renderScreen();
    fireEvent.click(sw('Helpful vote'));
    apiSend.mockRejectedValue(Object.assign(new Error('Reviews per page must be a whole number from 1 to 50'), { field: 'reviewsPerPage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Reviews per page must be a whole number from 1 to 50');
    expect(sw('Helpful vote')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('points at the file types when none is chosen', async () => {
    await renderScreen(settings({ photos: { enabled: true, maxPhotos: 3, maxFileSizeMb: 5, allowedTypes: ['jpeg'] } }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'JPEG files' }));
    apiSend.mockRejectedValue(Object.assign(new Error('Choose at least one allowed file type'), { field: 'photos.allowedTypes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Choose at least one file type.')).toBeInTheDocument();
  });

  it('Discard puts everything back', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('radio', { name: 'Anyone' }));
    fireEvent.click(sw('Helpful vote'));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('radio', { name: 'Verified buyers only' })).toBeChecked();
    expect(sw('Helpful vote')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});

describe('preview follows the settings', () => {
  const preview = () => screen.getByRole('complementary', { name: 'Preview' });

  it('shows the Verified owner badge, stars and helpful button when on', async () => {
    await renderScreen();
    expect(within(preview()).getByText('✓ Verified owner')).toBeInTheDocument();
    expect(within(preview()).getAllByLabelText('5 out of 5 stars').length).toBeGreaterThan(0);
    expect(within(preview()).getByRole('button', { name: 'Helpful (sample)' })).toBeInTheDocument();
    expect(within(preview()).getByText('Shows 10 reviews per page.')).toBeInTheDocument();
  });

  it('hides them when off', async () => {
    await renderScreen();
    fireEvent.click(sw('Show verified owner badge'));
    fireEvent.click(sw('Enable star rating'));
    fireEvent.click(sw('Helpful vote'));
    expect(within(preview()).queryByText('✓ Verified owner')).not.toBeInTheDocument();
    expect(within(preview()).queryAllByLabelText('5 out of 5 stars')).toHaveLength(0);
    expect(within(preview()).queryByRole('button', { name: 'Helpful (sample)' })).not.toBeInTheDocument();
    expect(within(preview()).getByText('Star ratings are off.')).toBeInTheDocument();
  });

  it('shows photo thumbnails only when photos are on', async () => {
    await renderScreen();
    expect(within(preview()).getByLabelText('3 photos')).toBeInTheDocument();
    fireEvent.click(sw('Allow photos in reviews'));
    expect(within(preview()).queryByLabelText('3 photos')).not.toBeInTheDocument();
  });

  it('describes who can review', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('radio', { name: 'Anyone' }));
    expect(within(preview()).getByText('Every visitor can write a review, no account or purchase needed.')).toBeInTheDocument();
  });
});
