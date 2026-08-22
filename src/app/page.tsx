import Link from "next/link";
import Header from "@/components/Header";
import LeaveBy from "@/components/LeaveBy";
import CalendarPanel from "@/components/CalendarPanel";
import EmailPanel from "@/components/EmailPanel";
import TaskPanel from "@/components/TaskPanel";
import NewsPanel from "@/components/NewsPanel";
import PortfolioPanel from "@/components/PortfolioPanel";
import ChatPanel from "@/components/ChatPanel";

export default function Home() {
  return (
    /* The point of a briefing is that it fits on one screen. From lg up the
       page itself never scrolls — the grid is bounded to the viewport and each
       panel scrolls inside its own body. Below lg the panels stack and the
       page scrolls normally. */
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[1700px] flex-col gap-6 px-5 py-8 sm:px-8 sm:py-9 lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <Header />
      <LeaveBy />

      {/* The grid reads in the same order the briefing speaks: what's
          happening near you, then what you owe, then who's waiting on you,
          then the day's shape, then the money. */}
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-3 lg:grid-rows-[1.15fr_1fr] xl:grid-cols-6">
        <NewsPanel className="lg:col-span-2 xl:col-span-3" />
        <TaskPanel className="xl:col-span-3" />
        <EmailPanel className="xl:col-span-2" />
        <CalendarPanel className="xl:col-span-2" />
        <PortfolioPanel className="xl:col-span-2" />
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 text-[11px] tracking-wide text-mist-400">
        <span>
          Calendar, tasks and email are pushed in from Zapier · news, weather, commute and
          portfolio are live
        </span>
        <span aria-hidden>·</span>
        <Link href="/health" className="underline-offset-2 hover:text-mist-200 hover:underline">
          health
        </Link>
      </footer>
      <ChatPanel />
    </main>
  );
}

