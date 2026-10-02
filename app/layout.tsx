import "./globals.css";
import "./mobile-game.css";
export const metadata={title:"SUPERmarket Tycoon"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/><meta name="theme-color" content="#0f172a"/></head><body>{children}</body></html>}