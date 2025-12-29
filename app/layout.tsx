import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { UpdateNotifier } from '@/components/update-notifier'
import './globals.css'

export const metadata: Metadata = {
  title: 'One List',
  description: 'One intelligent list for every task.',
  generator: 'v0.app',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <UpdateNotifier />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
