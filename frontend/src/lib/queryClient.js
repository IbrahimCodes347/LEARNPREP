import { QueryClient } from '@tanstack/react-query';

/** Server data always goes through TanStack Query - no useEffect+fetch loops. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry client errors; only transient network/5xx once.
        const status = error?.response?.status;
        if (status && status < 500) return false;
        return failureCount < 1;
      }
    },
    mutations: { retry: 0 }
  }
});

export default queryClient;