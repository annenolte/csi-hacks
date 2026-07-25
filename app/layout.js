import { Inter, Caveat } from "next/font/google";
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
  title: `${PRODUCT_NAME} — ${TAGLINE}`,
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
