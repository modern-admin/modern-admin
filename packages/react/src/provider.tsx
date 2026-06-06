// React context exposing the AdminClient + a shared QueryClient. Apps wrap
// their tree once with <ModernAdminProvider client={...}>.

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminClient, type AdminClientOptions } from './client.js'
import type { ComponentLoader } from './component-loader.js'

interface ContextShape {
  client: AdminClient
  components: ComponentLoader | null
}

const ModernAdminContext = React.createContext<ContextShape | null>(null)

export interface ModernAdminProviderProps {
  client?: AdminClient
  clientOptions?: AdminClientOptions
  queryClient?: QueryClient
  components?: ComponentLoader
  children: React.ReactNode
}

const defaultQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })

export function ModernAdminProvider({
  client,
  clientOptions,
  queryClient,
  components,
  children,
}: ModernAdminProviderProps): React.ReactElement {
  const resolvedClient = React.useMemo(
    () => client ?? new AdminClient(clientOptions),
    [client, clientOptions],
  )
  const resolvedQueryClient = React.useMemo(
    () => queryClient ?? defaultQueryClient(),
    [queryClient],
  )
  const value = React.useMemo<ContextShape>(
    () => ({ client: resolvedClient, components: components ?? null }),
    [resolvedClient, components],
  )

  return (
    <QueryClientProvider client={resolvedQueryClient}>
      <ModernAdminContext.Provider value={value}>{children}</ModernAdminContext.Provider>
    </QueryClientProvider>
  )
}

export const useAdminContext = (): ContextShape => {
  const ctx = React.useContext(ModernAdminContext)
  if (!ctx) {
    throw new Error('useAdminContext must be used inside <ModernAdminProvider />')
  }
  return ctx
}

export const useAdminClient = (): AdminClient => useAdminContext().client
