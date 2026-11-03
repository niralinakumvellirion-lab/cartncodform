/**
 * Reviews moderation screen and the Manage/Settings tabs (jsdom + React Testing Library).
 */
import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';
import ReviewsManage from '../app/admin/screens/ReviewsManage';
import ReviewsHome from '../app/admin/screens/ReviewsHome';

const SHOP = 'test.myshopify.com';
const BASE = `/api/reviews/${SHOP}/items`;

function review(over = {}) {
  return {
    id: 'r1', productId: '1', productHandle: 'blue-kurta', rating: 4, title: 'Nice fit',
    body: 'Soft fabric and true to size.', authorName: 'Asha', verified: true, status: 'pending',
    photos: [], helpfulCount: 0, createdAt: '2025-03-04T10:00:00.000Z', ...over,
  };
}

function list(items, over = {}) {
  return {
    items,
    counts: { pending: items.filter((i) => i.status === 'pending').length, approved: 0, hidden: 0, all: items.length },
    total: items.length, page: 1, pages: 1, ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ReviewsManage', () => {
  it('opens on Pending and asks the API for pending reviews', async () => {
    apiGet.mockResolvedValue(list([review()]));
    render(<ReviewsManage shop={SHOP} />);
    expect(await screen.findByText('Soft fabric and true to size.')).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith(`${BASE}?page=1&status=pending`);
    expect(screen.getByRole('tab', { name: /Pending/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('shows who wrote it, the rating, product, verified badge and status', async () => {
    apiGet.mockResolvedValue(list([review({ helpfulCount: 3 })]));
    render(<ReviewsManage shop={SHOP} />);
    const card = await screen.findByRole('article', { name: 'Review by Asha' });
    expect(within(card).getByText('✓ Verified buyer')).toBeInTheDocument();
    expect(within(card).getByLabelText('4 out of 5 stars')).toBeInTheDocument();
    expect(within(card).getByText('Product: blue-kurta')).toBeInTheDocument();
    expect(within(card).getByText('Pending')).toBeInTheDocument();
    expect(within(card).getByText('👍 3 helpful')).toBeInTheDocument();
  });

  it('shows review text as plain text, never as HTML', async () => {
    apiGet.mockResolvedValue(list([review({ body: '<img src=x onerror=alert(1)> hi', authorName: '<b>Bob</b>' })]));
    const { container } = render(<ReviewsManage shop={SHOP} />);
    expect(await screen.findByText('<img src=x onerror=alert(1)> hi')).toBeInTheDocument();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('shows photos as links that open in a new tab safely', async () => {
    apiGet.mockResolvedValue(list([review({ photos: ['https://res.cloudinary.com/demo/a.jpg'] })]));
    render(<ReviewsManage shop={SHOP} />);
    const link = (await screen.findByAltText('Customer photo')).closest('a');
    expect(link).toHaveAttribute('href', 'https://res.cloudinary.com/demo/a.jpg');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows the counts on each tab and switches the list', async () => {
    apiGet.mockResolvedValue({ ...list([]), counts: { pending: 2, approved: 5, hidden: 1, all: 8 } });
    render(<ReviewsManage shop={SHOP} />);
    await screen.findByText('No reviews are waiting for you.');
    expect(screen.getByRole('tab', { name: /Pending\s*2/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Approved\s*5/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /All\s*8/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Approved/ }));
    await waitFor(() => expect(apiGet).toHaveBeenLastCalledWith(`${BASE}?page=1&status=approved`));
    fireEvent.click(screen.getByRole('tab', { name: /All/ }));
    await waitFor(() => expect(apiGet).toHaveBeenLastCalledWith(`${BASE}?page=1`));
  });

  it('Approve sends PATCH status approved, then reloads', async () => {
    apiGet.mockResolvedValueOnce(list([review()])).mockResolvedValue(list([]));
    apiSend.mockResolvedValue({ item: review({ status: 'approved' }) });
    render(<ReviewsManage shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledWith(`${BASE}/r1`, 'PATCH', { status: 'approved' }));
    expect(await screen.findByText('No reviews are waiting for you.')).toBeInTheDocument();
  });

  it('offers only the actions that make sense for the status', async () => {
    apiGet.mockResolvedValue(list([review({ status: 'approved' })]));
    render(<ReviewsManage shop={SHOP} />);
    await screen.findByRole('article');
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
  });

  it('Hide sends PATCH status hidden', async () => {
    apiGet.mockResolvedValue(list([review({ status: 'approved' })]));
    apiSend.mockResolvedValue({});
    render(<ReviewsManage shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledWith(`${BASE}/r1`, 'PATCH', { status: 'hidden' }));
  });

  it('Delete asks first, and only sends DELETE after "Yes, delete"', async () => {
    apiGet.mockResolvedValue(list([review()]));
    apiSend.mockResolvedValue({ ok: true });
    render(<ReviewsManage shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(apiSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(apiSend).toHaveBeenCalledWith(`${BASE}/r1`, 'DELETE'));
  });

  it('shows the server message when an action fails and keeps the review', async () => {
    apiGet.mockResolvedValue(list([review()]));
    apiSend.mockRejectedValue(new Error('Review not found'));
    render(<ReviewsManage shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Review not found');
    expect(screen.getByRole('article')).toBeInTheDocument();
  });

  it('shows an error when the list cannot load', async () => {
    apiGet.mockRejectedValue(new Error('Network down'));
    render(<ReviewsManage shop={SHOP} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
  });

  it('pages through long lists', async () => {
    apiGet.mockResolvedValue(list([review()], { pages: 3, page: 1 }));
    render(<ReviewsManage shop={SHOP} />);
    await screen.findByRole('article');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(apiGet).toHaveBeenLastCalledWith(`${BASE}?page=2&status=pending`));
  });

  it('going back to page 1 when you switch tabs', async () => {
    apiGet.mockResolvedValue(list([review()], { pages: 3, page: 1 }));
    render(<ReviewsManage shop={SHOP} />);
    await screen.findByRole('article');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(apiGet).toHaveBeenLastCalledWith(`${BASE}?page=2&status=pending`));
    fireEvent.click(screen.getByRole('tab', { name: /Approved/ }));
    await waitFor(() => expect(apiGet).toHaveBeenLastCalledWith(`${BASE}?page=1&status=approved`));
  });

  it('does not fetch without a shop', () => {
    render(<ReviewsManage shop="" />);
    expect(apiGet).not.toHaveBeenCalled();
  });
});

describe('ReviewsHome tabs', () => {
  it('opens on Manage reviews, and Settings loads the settings screen', async () => {
    apiGet.mockImplementation(async (url) => (url.endsWith('/settings') ? { settings: {} } : list([])));
    render(<ReviewsHome shop={SHOP} />);
    expect(screen.getByRole('tab', { name: 'Manage reviews' })).toHaveAttribute('aria-selected', 'true');
    await screen.findByText('No reviews are waiting for you.');
    expect(apiGet).not.toHaveBeenCalledWith(`/api/reviews/${SHOP}/settings`);
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(await screen.findByRole('radiogroup', { name: 'Who can leave reviews' })).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith(`/api/reviews/${SHOP}/settings`);
  });
});
