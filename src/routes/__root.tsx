/// <reference types="vite/client" />
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import * as React from 'react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'The Manosphere Report' },
      {
        name: 'description',
        content:
          'Track and analyze manosphere podcast content with AI-powered transcription and analysis.',
      },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-b-gray-200 dark:border-b-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="font-heading text-xl tracking-tight">
              The Manosphere Report
            </Link>
            <div className="flex gap-6 text-sm font-medium">
              <Link
                to="/"
                activeProps={{ className: 'text-ink-600 dark:text-ink-300' }}
                activeOptions={{ exact: true }}
                className="hover:text-ink-500 dark:hover:text-ink-300 transition-colors"
              >
                Home
              </Link>
              <Link
                to="/admin"
                activeProps={{ className: 'text-ink-600 dark:text-ink-300' }}
                className="hover:text-ink-500 dark:hover:text-ink-300 transition-colors"
              >
                Admin
              </Link>
            </div>
          </div>
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t py-6 text-center text-xs font-mono text-gray-400 dark:text-gray-500 tracking-wide">
        The Manosphere Report &mdash; AI-powered podcast tracking and analysis
      </footer>
    </div>
  )
}
