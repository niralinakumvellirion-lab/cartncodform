/**
 * Setup checklist kept per store on the server (not in the browser): the /admin gate, the checklist's
 * ticks and buttons, and the dashboard "Setup guide" card. Mocks: __mocks__/api.js, next/navigation.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { apiGet, apiSend } from '../../../lib/api';

const replace = jest.fn();
let params = new URLSearchParams('shop=demo.myshopify.com&host=abc');
// Polaris needs window.matchMedia (missing in jsdom); its wrapper is not what is tested here.
jest.mock('@shopify/polaris', () => ({ AppProvider: ({ children }) => children }));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  useSearchParams: () => params,
}));

import AdminHome from '../app/admin/page';
import Onboarding from '../app/admin/screens/Onboarding';
import SetupGuideCard from '../app/admin/components/SetupGuideCard';

const SHOP = 'demo.myshopify.com';
const STEPS = (over = {}) => ({ embed: false, voice: false, signals: false, storefront: false, ...over });
const state = (over = {}) => ({ steps: STEPS(), doneCount: 0, total: 4, completed: false, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  params = new URLSearchParams(`shop=${SHOP}&host=abc`);
  window.history.pushState({}, '', `/admin?shop=${SHOP}&host=abc`);
  window.open = jest.fn();
  apiSend.mockResolvedValue(state());
});

describe('/admin gate', () => {
  it('not finished for this install → the checklist, with ticks from the server', async () => {
    apiGet.mockResolvedValue(state({ steps: STEPS({ voice: true }), doneCount: 1 }));
    render(<AdminHome />);
    expect(await screen.findByText('Welcome to ShopiReachBoost AI')).toBeInTheDocument();
    expect(apiGet).toHaveBeenCalledWith(`/api/onboarding/${SHOP}`);
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('finished → Dashboard (shop and host kept), no checklist', async () => {
    apiGet.mockResolvedValue(state({ completed: true }));
    render(<AdminHome />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/admin/dashboard?shop=${SHOP}&host=abc`));
    expect(screen.queryByText('Welcome to ShopiReachBoost AI')).not.toBeInTheDocument();
  });

  it('the server cannot be reached → Dashboard (never blocks the app)', async () => {
    apiGet.mockRejectedValue(new Error('down'));
    render(<AdminHome />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/admin/dashboard?shop=${SHOP}&host=abc`));
  });

  it('"Set up" on a step opens that admin page (it used to go nowhere)', async () => {
    apiGet.mockResolvedValue(state());
    render(<AdminHome />);
    await screen.findByText('Set your voice');
    fireEvent.click(screen.getAllByRole('button', { name: 'Set up' })[1]);
    expect(replace).toHaveBeenCalledWith(`/admin/signals?shop=${SHOP}&host=abc`);
    expect(apiSend).toHaveBeenCalledWith(`/api/onboarding/${SHOP}/steps/signals`, 'PUT', { done: true });
  });

  it('Skip for now → saved as finished for the store, then Dashboard', async () => {
    apiGet.mockResolvedValue(state());
    render(<AdminHome />);
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/admin/dashboard?shop=${SHOP}&host=abc`));
    expect(apiSend).toHaveBeenCalledWith(`/api/onboarding/${SHOP}/complete`, 'POST', {});
  });
});

describe('checklist', () => {
  const renderList = (steps = STEPS()) => {
    const onNavigate = jest.fn();
    const onDone = jest.fn();
    render(<Onboarding shop={SHOP} initialSteps={steps} onNavigate={onNavigate} onDone={onDone} />);
    return { onNavigate, onDone };
  };

  it('the four steps; step 4 opens the store (there is no test push to send)', () => {
    renderList();
    expect(screen.getByText('Turn on the storefront block')).toBeInTheDocument();
    expect(screen.getByText('Set your voice')).toBeInTheDocument();
    expect(screen.getByText('Choose what to act on')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open my store' }));
    expect(window.open).toHaveBeenCalledWith(`https://${SHOP}`, '_blank');
    expect(apiSend).toHaveBeenCalledWith(`/api/onboarding/${SHOP}/steps/storefront`, 'PUT', { done: true });
    expect(screen.queryByText(/Send yourself a test/)).not.toBeInTheDocument();
  });

  it('Set your voice → Settings page', () => {
    const { onNavigate } = renderList();
    fireEvent.click(screen.getAllByRole('button', { name: 'Set up' })[0]);
    expect(onNavigate).toHaveBeenCalledWith('settings-page');
  });

  it('a failed save is undone on screen', async () => {
    apiSend.mockRejectedValueOnce(new Error('down'));
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Open my store' }));
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('0 of 4 done')).toBeInTheDocument());
  });

  it('finishing still opens the Dashboard when the save fails', async () => {
    apiSend.mockRejectedValueOnce(new Error('down'));
    const { onDone } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});

describe('dashboard Setup guide card', () => {
  it('shown while the storefront step is not done; opens the editor with the embed on; "I\'ve turned it on" hides it', async () => {
    apiGet.mockResolvedValue(state());
    render(<SetupGuideCard shop={SHOP} />);
    expect(await screen.findByRole('heading', { name: 'Turn on the storefront block' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Turn on in theme editor/ }));
    expect(window.open.mock.calls[0][0]).toContain(`https://${SHOP}/admin/themes/current/editor?context=apps`);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: "I've turned it on" })); });
    expect(apiSend).toHaveBeenCalledWith(`/api/onboarding/${SHOP}/steps/embed`, 'PUT', { done: true });
    expect(screen.queryByRole('heading', { name: 'Turn on the storefront block' })).not.toBeInTheDocument();
  });

  it('hidden once the step is done, or when the state cannot be loaded', async () => {
    apiGet.mockResolvedValue(state({ steps: STEPS({ embed: true }) }));
    const { container, unmount } = render(<SetupGuideCard shop={SHOP} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();
    apiGet.mockRejectedValue(new Error('down'));
    const second = render(<SetupGuideCard shop={SHOP} />);
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });

  it('a failed save keeps the card and says so', async () => {
    apiGet.mockResolvedValue(state());
    apiSend.mockRejectedValueOnce(new Error('down'));
    render(<SetupGuideCard shop={SHOP} />);
    fireEvent.click(await screen.findByRole('button', { name: "I've turned it on" }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('heading', { name: 'Turn on the storefront block' })).toBeInTheDocument();
  });

  it('is on the dashboard', () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/admin/dashboard/DashboardScreen.jsx'), 'utf8');
    expect(src).toContain("import SetupGuideCard from '../components/SetupGuideCard';");
    expect(src).toContain('<SetupGuideCard shop={shop} />');
  });
});
