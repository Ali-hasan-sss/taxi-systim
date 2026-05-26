import "./globals.css";
import "leaflet/dist/leaflet.css";

export const metadata = {
  title: "Taxi Office Admin Dashboard",
  description: "Taxi office operations, orders, drivers and accounting management"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
