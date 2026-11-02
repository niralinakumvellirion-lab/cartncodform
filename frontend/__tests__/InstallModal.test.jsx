/**
 * Landing-page install popup: Shopify forbids asking merchants to type a
 * myshopify.com address to install, so the popup only points to the App Store.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import InstallModal from '../app/components/landing/InstallModal';

describe('InstallModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<InstallModal isOpen={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('has no text input and no form (no store address entry)', () => {
    const { container } = render(<InstallModal isOpen onClose={() => {}} />);
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('form')).toBeNull();
  });

  it('never mentions a myshopify.com address field', () => {
    const { container } = render(<InstallModal isOpen onClose={() => {}} />);
    expect(container.textContent).not.toMatch(/myshopify\.com/i);
  });

  it('points to the Shopify App Store and states the 30-day trial', () => {
    render(<InstallModal isOpen onClose={() => {}} />);
    const link = screen.getByRole('link', { name: /Open Shopify App Store/i });
    expect(link).toHaveAttribute('href', 'https://apps.shopify.com');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText(/30-day free trial/)).toBeInTheDocument();
    expect(screen.getByText('Install from the Shopify App Store')).toBeInTheDocument();
  });

  it('Close button calls onClose', () => {
    const onClose = jest.fn();
    render(<InstallModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
