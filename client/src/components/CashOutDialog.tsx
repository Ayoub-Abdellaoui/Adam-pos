import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { formatDZD } from "@/lib/currency";
import { CircleDollarSign, Loader2, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type CashOutBranch = { id: number; name: string };
type CashOutCategory = "employee_advance" | "store_operations";

export function CashOutDialog({ open, onOpenChange, branches, initialStoreId }: { open: boolean; onOpenChange: (open: boolean) => void; branches: CashOutBranch[]; initialStoreId?: number }) {
  const utils = trpc.useUtils();
  const [storeId, setStoreId] = useState(initialStoreId ? String(initialStoreId) : "");
  const [shiftId, setShiftId] = useState("");
  const [category, setCategory] = useState<CashOutCategory>("store_operations");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employee, setEmployee] = useState<{ userId: number; name: string | null; email: string | null } | null>(null);
  const selectedStoreId = Number(storeId);
  const activeShifts = trpc.cashOut.activeShifts.useQuery({ storeId: selectedStoreId }, { enabled: open && Number.isInteger(selectedStoreId) && selectedStoreId > 0 });
  const employeeSearch = trpc.cashOut.employeeSearch.useQuery({ storeId: selectedStoreId, query: employeeQuery, limit: 12 }, { enabled: open && category === "employee_advance" && Number.isInteger(selectedStoreId) && selectedStoreId > 0 && employeeQuery.trim().length > 0 });
  const selectedShift = activeShifts.data?.find(shift => shift.id === Number(shiftId));
  const create = trpc.cashOut.create.useMutation({
    onSuccess: result => {
      void utils.cashOut.activeShifts.invalidate(); void utils.cashOut.ledger.invalidate(); void utils.cashOut.employeeAdvances.invalidate(); void utils.enterprise.shifts.active.invalidate(); void utils.enterprise.shifts.summary.invalidate();
      setAmount(""); setNotes(""); setEmployeeQuery(""); setEmployee(null); setShiftId(""); onOpenChange(false);
      toast.success(`Cash Out recorded. Expected drawer balance is now ${formatDZD(Number(result.expectedCash))}.`);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => { if (open && initialStoreId) setStoreId(String(initialStoreId)); }, [initialStoreId, open]);
  useEffect(() => { if (activeShifts.data?.length === 1) setShiftId(String(activeShifts.data[0].id)); }, [activeShifts.data]);
  useEffect(() => { if (category === "store_operations") { setEmployee(null); setEmployeeQuery(""); } }, [category]);

  const validAmount = Number(amount);
  const canSubmit = Boolean(selectedStoreId && shiftId && Number.isFinite(validAmount) && validAmount > 0 && notes.trim().length >= 2 && (category === "store_operations" || employee));
  const submit = () => {
    if (!canSubmit) return;
    create.mutate({ storeId: selectedStoreId, shiftId: Number(shiftId), category, amount: validAmount, notes: notes.trim(), ...(category === "employee_advance" && employee ? { recipientUserId: employee.userId } : {}) });
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-rose-600" /> Cash Out</DialogTitle><DialogDescription>Record cash removed from the drawer during an active shift. The expected drawer balance is updated immediately.</DialogDescription></DialogHeader><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="cash-out-branch" className="mb-1.5 block">Branch</Label><Select value={storeId} onValueChange={value => { setStoreId(value); setShiftId(""); setEmployee(null); setEmployeeQuery(""); }} disabled={Boolean(initialStoreId)}><SelectTrigger id="cash-out-branch"><SelectValue placeholder="Select branch" /></SelectTrigger><SelectContent>{branches.map(branch => <SelectItem key={branch.id} value={String(branch.id)}>{branch.name}</SelectItem>)}</SelectContent></Select></div><div><Label htmlFor="cash-out-shift" className="mb-1.5 block">Active cash shift</Label><Select value={shiftId} onValueChange={setShiftId} disabled={!selectedStoreId || activeShifts.isLoading}><SelectTrigger id="cash-out-shift"><SelectValue placeholder={activeShifts.isLoading ? "Loading shifts…" : "Select active shift"} /></SelectTrigger><SelectContent>{activeShifts.data?.map(shift => <SelectItem key={shift.id} value={String(shift.id)}>{shift.cashierName || "Cashier"} · {formatDZD(Number(shift.expectedCash))}</SelectItem>)}</SelectContent></Select></div></div>{selectedShift && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-100"><span className="font-semibold">Expected drawer balance:</span> <span className="font-mono font-bold">{formatDZD(Number(selectedShift.expectedCash))}</span></div>}<div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="cash-out-amount" className="mb-1.5 block">Amount (DZD)</Label><Input id="cash-out-amount" value={amount} onChange={event => setAmount(event.target.value)} type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" /></div><div><Label className="mb-1.5 block">Transaction type</Label><Select value={category} onValueChange={value => setCategory(value as CashOutCategory)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="employee_advance">Employee Salary / Advance</SelectItem><SelectItem value="store_operations">Store Operations / Petty Cash</SelectItem></SelectContent></Select></div></div>{category === "employee_advance" && <div><Label htmlFor="cash-out-employee-search" className="mb-1.5 block">Employee receiving cash</Label><div className="relative"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="cash-out-employee-search" value={employeeQuery} onChange={event => { setEmployeeQuery(event.target.value); setEmployee(null); }} className="ps-9" placeholder="Search employee name or email" autoComplete="off" /></div><div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-border bg-popover text-popover-foreground shadow-sm dark:bg-slate-900">{employeeQuery.trim() ? employeeSearch.isFetching ? <p className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching employees…</p> : employeeSearch.data?.length ? employeeSearch.data.map(result => <button key={result.userId} type="button" onClick={() => { setEmployee({ userId: result.userId, name: result.name, email: result.email }); setEmployeeQuery(result.name || result.email || `Employee #${result.userId}`); }} className={`block w-full border-b border-border px-3 py-2.5 text-start last:border-b-0 hover:bg-muted ${employee?.userId === result.userId ? "bg-primary/10" : ""}`}><span className="block text-sm font-semibold text-foreground dark:text-white">{result.name || "Unnamed employee"}</span><span className="block text-xs text-muted-foreground">{result.email || result.role.replace("_", " ")}</span></button>) : <p className="px-3 py-3 text-sm text-muted-foreground">No branch employee matches this search.</p> : <p className="px-3 py-3 text-sm text-muted-foreground">Search by employee name or email.</p>}</div>{employee && <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-primary"><UserRound className="h-4 w-4" /> {employee.name || employee.email} selected for this advance.</p>}</div>}<div><Label htmlFor="cash-out-notes" className="mb-1.5 block">Notes / reason</Label><Input id="cash-out-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder={category === "employee_advance" ? "e.g. August salary advance" : "e.g. Change float / cleaning supplies / delivery fee"} /></div><div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="button" onClick={submit} disabled={!canSubmit || create.isPending} className="bg-rose-600 text-white hover:bg-rose-700">{create.isPending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <CircleDollarSign className="me-2 h-4 w-4" />}Record Cash Out</Button></div></div></DialogContent></Dialog>;
}
