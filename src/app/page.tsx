import Header from "@/components/Header";
import CalendarPanel from "@/components/CalendarPanel";
import EmailPanel from "@/components/EmailPanel";
import TaskPanel from "@/components/TaskPanel";
import NewsPanel from "@/components/NewsPanel";
import PortfolioPanel from "@/components/PortfolioPanel";

export default function Home() {
  return (
    /* The point of a briefing is that it fits on one screen. From lg up the
       page itself never scrolls — the grid is bounded to the viewport and each
       panel scrolls inside its own body. Below lg the panels stack and the
       page scrolls normally. */
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[1700px] flex-col gap-6 px-5 py-8 sm:px-8 sm:py-9 lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <Header />

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-3 lg:grid-rows-[1.15fr_1fr] xl:grid-cols-6">
        <CalendarPanel className="xl:col-span-2" />
        <EmailPanel className="xl:col-span-2" />
        <TaskPanel className="xl:col-span-2" />
        <NewsPanel className="lg:col-span-2 xl:col-span-4" />
        <PortfolioPanel className="xl:col-span-2" />
      </div>

      <footer className="shrink-0 text-center text-[11px] tracking-wide text-mist-400">
        Calendar, email and tasks are mock data · news, weather and portfolio are live-wired
      </footer>
    </main>
  );
}
