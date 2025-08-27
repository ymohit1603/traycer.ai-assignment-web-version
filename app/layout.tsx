import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Traycer - AI Codebase Planner",
  description: "Upload your codebase and get detailed AI-powered implementation plans",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1f2937',
              color: '#f9fafb',
              border: '1px solid #374151',
            },
            success: {
              style: {
                background: '#065f46',
                color: '#d1fae5',
                border: '1px solid #10b981',
              },
            },
            error: {
              style: {
                background: '#7f1d1d',
                color: '#fecaca',
                border: '1px solid #ef4444',
              },
            },
            loading: {
              style: {
                background: '#1e40af',
                color: '#dbeafe',
                border: '1px solid #3b82f6',
              },
            },
          }}
        />
      </body>
    </html>
  );
}
