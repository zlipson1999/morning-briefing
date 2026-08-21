import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="font-mono text-[11px] tracking-[0.34em] text-[#5cc8de] uppercase">
        Morning Briefing
      </p>
      <h1 className="text-2xl font-semibold text-mist-100">Nothing here.</h1>
      <p className="max-w-md text-sm leading-relaxed text-mist-300">
        This app is one screen. That&apos;s the point.
      </p>
      <Link
        href="/"
        className="rounded-lg border border-ink-600 px-4 py-2 text-xs font-medium tracking-wide text-mist-200 uppercase transition-colors hover:border-mist-400 hover:text-mist-100 focus-visible:ring-2 focus-visible:ring-[#5cc8de] focus-visible:outline-none"
      >
        Back to the briefing
      </Link>
    </main>
  );
}
