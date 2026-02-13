import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Product Costing",
  description: "A simple, fast cost sheet for products and batches.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${inter.variable} antialiased`}>
        {children}
        <footer className="app-global-footer" aria-label="Site footer">
          <div className="app-global-footer__row">
            <span>Created by: Justiniano Tagarda</span>
            <a href="mailto:justintagarda@gmail.com">Email: justintagarda@gmail.com</a>
          </div>
          <div className="app-global-footer__row">
            <span>Stack: Next.js, React, TypeScript, Tailwind CSS</span>
            <span>Hosting: Vercel</span>
            <span>Database/Auth: Supabase (Postgres + Google OAuth)</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
