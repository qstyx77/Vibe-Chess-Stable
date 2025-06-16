
import type {Metadata, Viewport} from 'next';
import { Geist, Geist_Mono } from 'next/font/google'; // Corrected import name
import { Press_Start_2P } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Added Toaster
import { WebRTCProvider } from '@/webrtc/WebRTCContext';

const geistSans = Geist({ // Corrected function name
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({ // Corrected function name
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const pressStart2P = Press_Start_2P({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-press-start-2p',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VIBE CHESS - 8 Bit Edition',
  description: 'An online multiplayer chess game with leveling pieces, in glorious 8-bit style.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1.0,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${pressStart2P.variable}`}>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}>
        <WebRTCProvider>
          <main className="flex-grow">
            {children}
          </main>
          <Toaster />
          <footer className="py-4 text-center text-xs text-muted-foreground font-pixel">
            Made By Sugga
          </footer>
        </WebRTCProvider>
      </body>
    </html>
  );
}
