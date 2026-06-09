import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/** ويب فقط: اتجاه المستند عربي؛ شريط التنقل يُثبَّت LTR في التخطيط. */
export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
