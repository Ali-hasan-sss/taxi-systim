import "./globals.css";

export const metadata = {
  title: "Taxi Office Admin Dashboard",
  description: "Taxi office operations, orders, drivers and accounting management"
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
