import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Loader2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the image."));
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

export default function OcrSpaceTest() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [structuredRows, setStructuredRows] = useState<Array<{ productName: string; reference: string | null; quantity: number | null; costPrice: number | null; totalAmount: number | null }>>([]);
  const test = trpc.ocrSpaceTest.run.useMutation({ onError: failure => setError(failure.message) });
  useEffect(() => { if (test.data) setStructuredRows(test.data.structuredRows); }, [test.data]);

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    test.reset();
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose a JPEG, PNG, or WebP image.");
      setFileName(file.name);
      setDataUrl(await readAsDataUrl(file));
    } catch (failure) {
      setFileName(null);
      setDataUrl(null);
      setError(failure instanceof Error ? failure.message : "Could not read the image.");
    }
  };

  const runTest = () => {
    if (!dataUrl) return;
    setError(null);
    test.mutate({ dataUrl });
  };

  return <div className="mx-auto max-w-4xl space-y-6">
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700">Preview-only tool</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">OCR.space invoice test</h1>
      <p className="mt-2 text-sm text-muted-foreground">This isolated test uses the original image, Arabic OCR, Engine 3, and table recognition. It does not enter the Adam POS invoice workflow.</p>
    </div>
    <Card>
      <CardHeader><CardTitle className="text-base">Select an invoice image</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-sm font-semibold text-slate-700 hover:bg-slate-100">
          <Upload className="h-4 w-4" />
          <span>{fileName ?? "Choose JPEG, PNG, or WebP"}</span>
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void chooseFile(event.target.files?.[0]); }} />
        </label>
        <Button type="button" onClick={runTest} disabled={!dataUrl || test.isPending} className="w-full sm:w-auto">
          {test.isPending ? <><Loader2 className="animate-spin" /> Running OCR.space</> : "Run OCR.space test"}
        </Button>
        {error && <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}
      </CardContent>
    </Card>
    {test.data && <Card>
      <CardHeader><CardTitle className="text-base">OCR.space result</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><span>Arabic: {test.data.language}</span><span>Engine: {test.data.engine}</span><span>Table recognition: enabled</span>{test.data.processingTimeMs && <span>{test.data.processingTimeMs} ms</span>}</div>
        <pre dir="auto" className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">{test.data.text || "OCR.space returned no text."}</pre>
      </CardContent>
    </Card>}
    {test.data && <Card>
      <CardHeader><CardTitle className="text-base">Structured Result</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="p-3">Product Name</th><th className="p-3">Reference</th><th className="p-3">Quantity</th><th className="p-3">Cost Price</th><th className="p-3">Total</th></tr></thead>
          <tbody>{structuredRows.map((row, index) => <tr key={index} className="border-b border-border/70 align-top">
            <td className="p-2"><input className="w-full rounded-md border border-border bg-background px-2 py-1.5" value={row.productName} onChange={event => setStructuredRows(rows => rows.map((item, itemIndex) => itemIndex === index ? { ...item, productName: event.target.value } : item))} /></td>
            <td className="p-2"><input className="w-36 rounded-md border border-border bg-background px-2 py-1.5" value={row.reference ?? ""} onChange={event => setStructuredRows(rows => rows.map((item, itemIndex) => itemIndex === index ? { ...item, reference: event.target.value || null } : item))} /></td>
            <td className="p-2"><input className="w-24 rounded-md border border-border bg-background px-2 py-1.5" type="number" value={row.quantity ?? ""} onChange={event => setStructuredRows(rows => rows.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: event.target.value ? Number(event.target.value) : null } : item))} /></td>
            <td className="p-2"><input className="w-28 rounded-md border border-border bg-background px-2 py-1.5" type="number" value={row.costPrice ?? ""} onChange={event => setStructuredRows(rows => rows.map((item, itemIndex) => itemIndex === index ? { ...item, costPrice: event.target.value ? Number(event.target.value) : null } : item))} /></td>
            <td className="p-2"><input className="w-28 rounded-md border border-border bg-background px-2 py-1.5" type="number" value={row.totalAmount ?? ""} onChange={event => setStructuredRows(rows => rows.map((item, itemIndex) => itemIndex === index ? { ...item, totalAmount: event.target.value ? Number(event.target.value) : null } : item))} /></td>
          </tr>)}</tbody>
        </table>
      </CardContent>
    </Card>}
  </div>;
}
