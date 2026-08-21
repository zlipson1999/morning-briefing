import Header from "@/components/Header";
import CalendarPanel from "@/components/CalendarPanel";
import EmailPanel from "@/components/EmailPanel";
import TaskPanel from "@/components/TaskPanel";

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[1500px] flex-col gap-7 px-5 py-8 sm:px-8 sm:py-10">
      <Header />

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-3 lg:[&>section]:max-h-[calc(100dvh-13rem)]">
        <CalendarPanel />
        <EmailPanel />
        <TaskPanel />
      </div>

      <footer className="pb-2 text-center text-[11px] tracking-wide text-mist-400/70">
        Mock data — no accounts connected yet.
      </footer>
    </main>
  );
}
