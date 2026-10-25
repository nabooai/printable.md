import type { Metadata } from 'next'
import {
  Instrument_Serif,
  Source_Serif_4,
  JetBrains_Mono,
  Playfair_Display,
  Bebas_Neue,
  Inter,
  Fraunces,
  Space_Grotesk,
  Archivo_Black,
} from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-display',
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
})

const bebas = Bebas_Neue({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-bebas',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space',
})

const archivoBlack = Archivo_Black({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-archivo',
})

export const metadata: Metadata = {
  title: 'Nisism Print',
  description: 'Turn plain markdown into a beautifully typeset, printable document.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body
        className={`${instrumentSerif.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} ${playfair.variable} ${bebas.variable} ${inter.variable} ${fraunces.variable} ${spaceGrotesk.variable} ${archivoBlack.variable} font-sans antialiased`}
      >
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
