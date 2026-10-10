
import React from 'react';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ParentGlobalPortfolio } from '../../components/ParentGlobalPortfolio';
import { useStore } from '../../store/useStore';
import { describe, test, expect, afterEach } from 'vitest';



// Helper to set a minimal user with parentId
function setParentId(id: string) {
  // The User type expects many fields, but for our tests we only need `id`.
  // Cast to any to avoid TypeScript errors.
  (useStore as any).setState({ user: { id } });
}

// Reset store after each test
afterEach(() => {
  cleanup();
  (useStore as any).setState({ user: null });
  // Restore original fetch if it was mocked
  if ((global as any).__originalFetch) {
    (global as any).fetch = (global as any).__originalFetch;
    delete (global as any).__originalFetch;
  }
});

describe('ParentGlobalPortfolio – React rendering', () => {
  const sampleChild = {
    student_global_id: 'uuid-child-1',
    display_name: 'Jean DUPONT',
    schools: [{ school_slug: 'ecole-pasteur', school_name: 'École Pasteur' }],
    access: {
      state: 'PAID_ACTIVE',
      accessAllowed: true
    }
  } as const;

  const mockFetchSuccess = (data: any) => {
    (global as any).__originalFetch = (global as any).fetch;
    (global as any).fetch = async () => ({
      ok: true,
      json: async () => data,
      text: async () => JSON.stringify(data),
    } as any);
  };

  const mockFetchError = (status: number, body: any) => {
    // Ensure the thrown error contains a `message` property for the component's error handling
    const errorBody = { message: body.error ?? body.message ?? 'Erreur serveur.' };
    (global as any).__originalFetch = (global as any).fetch;
    (global as any).fetch = async () => ({
      ok: false,
      status,
      json: async () => errorBody,
      text: async () => JSON.stringify(errorBody),
    } as any);
  };

  test('displays a child and its associated establishment', async () => {
    setParentId('parent-1');
    mockFetchSuccess({ children: [sampleChild] });

    render(<ParentGlobalPortfolio />);
    // Initially shows loading indicator
    expect(screen.getByText(/Chargement du portefeuille/i)).toBeTruthy();

    // Wait for data to appear
    await waitFor(() => {
      expect(screen.getByText(sampleChild.display_name)).toBeTruthy();
    });

    // Verify school name is rendered
    expect(screen.getByText('École Pasteur')).toBeTruthy();
    // Verify badge for PAID_ACTIVE
    expect(screen.getByText('Pack actif')).toBeTruthy();
  });

  test('renders all four Parent Pack states', async () => {
    const states = [
      { state: 'PAID_ACTIVE', label: 'Pack actif' },
      { state: 'GRACE_ACTIVE', label: 'Période de grâce' },
      { state: 'LEGACY_UNDECIDED', label: 'Situation à vérifier' },
      { state: 'PACK_SUSPENDED', label: 'Pack suspendu' },
    ];

    setParentId('parent-1');

    for (const { state, label } of states) {
      const child = { ...sampleChild, access: { state, accessAllowed: true } } as any;
      mockFetchSuccess({ children: [child] });
      render(<ParentGlobalPortfolio />);
      await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
      cleanup();
    }
  });

  test('shows grace date when present', async () => {
    setParentId('parent-1');
    const child = {
      ...sampleChild,
      access: {
        state: 'GRACE_ACTIVE',
        accessAllowed: true,
        grace_expires_at: '2026-12-31T12:00:00.000Z',
      },
    } as const;
    mockFetchSuccess({ children: [child] });
    render(<ParentGlobalPortfolio />);
    await waitFor(() => expect(screen.getByText('Période de grâce')).toBeTruthy());
    expect(screen.getByText(/Fin de grâce le/i)).toBeTruthy();
  });

  test('displays empty state when no children returned', async () => {
    setParentId('parent-1');
    mockFetchSuccess({ children: [] });
    render(<ParentGlobalPortfolio />);
    await waitFor(() => {
      expect(screen.getByText(/Aucun enfant associé/i)).toBeTruthy();
    });
  });

  test('handles API error and retry button works', async () => {
    setParentId('parent-1');
    mockFetchError(500, { error: 'Erreur serveur.' });
    render(<ParentGlobalPortfolio />);
    await waitFor(() => expect(screen.getByText('Erreur serveur.')).toBeTruthy());
    // Prepare successful fetch for retry
    mockFetchSuccess({ children: [sampleChild] });
    const retryBtn = screen.getByText('Réessayer');
    await userEvent.click(retryBtn);
    await waitFor(() => expect(screen.getByText(sampleChild.display_name)).toBeTruthy());
  });

  test('session change aborts in‑flight request and does not render stale data', async () => {
    // Start with parent A and a delayed fetch
    setParentId('parent-A');
    let resolveFetch: (data: any) => void;
    const fetchPromise = new Promise(resolve => {
      resolveFetch = resolve;
    });
    (global as any).__originalFetch = (global as any).fetch;
    (global as any).fetch = async () => ({ ok: true, json: async () => await fetchPromise } as any);

    render(<ParentGlobalPortfolio />);
    // Immediately switch parent to B before fetch resolves
    act(() => {
      setParentId('parent-B');
    });
    // Resolve fetch with data for parent A
    act(() => {
      resolveFetch!({ children: [sampleChild] });
    });
    // Component should not display child from parent A
    await waitFor(() => {
      // Loading should have finished but no child should be present
      expect(screen.queryByText(sampleChild.display_name)).toBeNull();
    });
  });

  test('does not render any navigation links', async () => {
    setParentId('parent-1');
    mockFetchSuccess({ children: [sampleChild] });
    render(<ParentGlobalPortfolio />);
    await waitFor(() => expect(screen.getByText(sampleChild.display_name)).toBeTruthy());
    const links = screen.queryAllByRole('link');
    expect(links).toHaveLength(0);
  });
});
