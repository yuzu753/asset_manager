import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asset Manager",
  description: "Supabase backed asset manager",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
