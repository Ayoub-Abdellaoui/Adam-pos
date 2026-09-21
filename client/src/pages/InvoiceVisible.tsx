import { Button } from "@/components/ui/button";
import { FileUp } from "lucide-react";
import { useLocation } from "wouter";

export default function InvoiceVisible() {
  const [, setLocation] = useLocation();
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <section className="w-full max-w-3xl rounded-[2rem] bg-white p-10 text-center shadow-[0_24px_70px_-35px_rgba(18,36,30,.4)] sm:p-16">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e6f0cb] text-[#42634c]"><FileUp className="h-8 w-8" /></div>
        <h1 className="mt-6 font-display text-4xl font-bold tracking-[-.05em] text-[#12241e] sm:text-5xl">Invoice AI Staging Area</h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">This route is visible and ready for the invoice upload and staging workflow.</p>
        <Button onClick={() => setLocation("/admin/invoice-import")} className="mt-8 h-12 bg-[#12241e] px-6 text-white hover:bg-[#213c31]">Open full invoice import</Button>
      </section>
    </main>
  );
}

