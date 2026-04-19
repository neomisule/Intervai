import type { ReactNode } from "react";
import { Auth0Provider } from "@auth0/nextjs-auth0/client";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Auth0Provider>{children}</Auth0Provider>
      </body>
    </html>
  );
}
