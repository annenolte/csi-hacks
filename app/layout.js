import { Inter, Caveat } from "next/font/google";
import Cursor from "@/components/landing/Cursor";
import { PRODUCT_NAME, TAGLINE } from "@/lib/brand";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  weight: ["500", "600"],
  subsets: ["latin"],
});

export const metadata = {
  title: `${PRODUCT_NAME}: ${TAGLINE}`,
  description:
    "Hand over the website and documents you already have. An agent reads them, " +
    "asks about the gaps, and answers your phone with answers you'd have given yourself.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${caveat.variable} h-full antialiased`}
    >
      {/*
        The cursor dot is mounted here rather than per-page: it is part of the
        product's surface, not the marketing page's, and one instance at the
        root means it can't blink out on a client-side navigation between two
        screens that both wanted it.
      */}
      <body className="min-h-full flex flex-col">
        <Cursor />
        {children}
      </body>
    </html>
  );
}
