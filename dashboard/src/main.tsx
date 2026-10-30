import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ApiError } from './api/client';
import { keys } from './api/queries';
import '@fontsource-variable/inter';
import './index.css';
import { applyTheme } from './lib/theme';
import { routes } from './router';

applyTheme();

const queryClient: QueryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } },
  queryCache: new QueryCache({
    // An expired session anywhere sends the owner back to the sign-in page.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData(keys.auth, { setupRequired: false, authenticated: false });
      }
    },
  }),
});

const router = createBrowserRouter(routes);
const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
