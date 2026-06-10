import { Cairo } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-cairo"
});

export const metadata = {
  title: "Taxi Bro — لوحة الإدارة",
  description: "إدارة شركة التكسي — الطلبات والسائقون والمالية"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className={cairo.className}>{children}</body>
    </html>
  );
}
