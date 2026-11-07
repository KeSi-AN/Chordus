import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Music2, Plus } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Chordus", template: "%s · Chordus" },
  description: "Chord sheets, pitch shifting and voice-fit suggestions",
};

/** Runs before paint so the saved theme applies without a flash. */
const themeScript = `(() => {
  try {
    const t = localStorage.getItem("theme");
    const dark = t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  } catch {}
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <TooltipProvider delay={300}>
          <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur print:hidden">
            <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <Music2 className="size-5 text-primary" aria-hidden />
                Chordus
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                <Link
                  href="/"
                  className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  Library
                </Link>
                <Link
                  href="/songs/new"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Plus className="size-3.5" aria-hidden />
                  Add song
                </Link>
              </nav>
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        </TooltipProvider>
      </body>
    </html>
  );
}
