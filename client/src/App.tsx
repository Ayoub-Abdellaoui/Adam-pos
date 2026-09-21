import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import CashierPOS from "./pages/CashierPOS";
import InvoiceStaging from "./pages/InvoiceStaging";
import LabelGenerator from "./pages/LabelGenerator";
import NotFound from "./pages/NotFound";
import AdminBranchLanding from "./pages/AdminBranchLanding";
import Overview from "./pages/Overview";
import ProductManagement from "./pages/ProductManagement";
import ProductDetails from "./pages/ProductDetails";
import AvailableProducts from "./pages/AvailableProducts";
import BranchStatistics from "./pages/BranchStatistics";
import SalesHistory from "./pages/SalesHistory";
import StaffManagement, { BranchStaffManagement } from "./pages/StaffManagement";
import EnterpriseOperations from "./pages/EnterpriseOperations";
import { ExpenseManagement, SupplierInvoiceManagement } from "./pages/FinancialManagement";
import SupplierProfile from "./pages/SupplierProfile";
import { CustomerDirectoryRoute, CustomerProfileRoute } from "./pages/CustomerProfile";
import CashOutManagement from "./pages/CashOutManagement";
import { useAuth } from "./_core/hooks/useAuth";
import OcrSpaceTest from "./pages/OcrSpaceTest";

function isSuperAdmin(user: ReturnType<typeof useAuth>["user"]) {
  return Boolean(user?.isSuperAdmin || user?.role === "super_admin");
}

function hasBranchRole(user: ReturnType<typeof useAuth>["user"], storeId: number, roles: Array<"admin" | "cashier" | "stock_manager" | "supervisor">) {
  return isSuperAdmin(user) || Boolean(user?.branchRoles?.some(assignment => assignment.storeId === storeId && roles.includes(assignment.role)));
}

function WorkspaceHome() {
  return <AdminBranchLanding />;
}

function AdminInvoiceRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <InvoiceStaging /> : <AccessDenied />;
}

function AdminPosPreviewRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <CashierPOS adminPreview /> : <AccessDenied />;
}

function OcrSpaceTestRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <OcrSpaceTest /> : <AccessDenied />;
}

function AdminLabelsRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <LabelGenerator /> : <AccessDenied />;
}

function AdminProductsRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <ProductManagement /> : <AccessDenied />;
}

function AdminBranchProductsRoute({ storeId }: { storeId: string }) {
  const { user } = useAuth();
  const parsedStoreId = Number(storeId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && hasBranchRole(user, parsedStoreId, ["admin", "stock_manager"]) ? <ProductManagement storeId={parsedStoreId} /> : <AccessDenied />;
}

function BranchAvailableProductsRoute({ storeId }: { storeId: string }) {
  const { user } = useAuth(); const parsedStoreId = Number(storeId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && hasBranchRole(user, parsedStoreId, ["cashier"]) ? <AvailableProducts storeId={parsedStoreId} /> : <AccessDenied />;
}

function AdminBranchInvoiceRoute({ storeId }: { storeId: string }) {
  const { user } = useAuth();
  const parsedStoreId = Number(storeId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && hasBranchRole(user, parsedStoreId, ["admin", "stock_manager"]) ? <InvoiceStaging initialStoreId={parsedStoreId} /> : <AccessDenied />;
}

function AdminSalesHistoryRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <SalesHistory /> : <AccessDenied />;
}

function AdminStaffRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <StaffManagement /> : <AccessDenied />;
}

function GlobalStatisticsRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <Overview /> : <AccessDenied />;
}

function GlobalSuppliersRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <SupplierInvoiceManagement /> : <AccessDenied />;
}

function GlobalSupplierProfileRoute({ supplierId }: { supplierId: string }) {
  const { user } = useAuth(); const parsedSupplierId = Number(supplierId);
  return isSuperAdmin(user) && Number.isInteger(parsedSupplierId) && parsedSupplierId > 0 ? <SupplierProfile supplierId={parsedSupplierId} /> : <AccessDenied />;
}

function GlobalExpensesRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <ExpenseManagement /> : <AccessDenied />;
}

function GlobalCashOutRoute() {
  const { user } = useAuth();
  return isSuperAdmin(user) ? <CashOutManagement /> : <AccessDenied />;
}

function BranchStaffRoute({ storeId }: { storeId: string }) {
  const { user } = useAuth(); const parsedStoreId = Number(storeId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && hasBranchRole(user, parsedStoreId, ["admin"]) ? <BranchStaffManagement storeId={parsedStoreId} /> : <AccessDenied />;
}

function BranchPosRoute({ storeId }: { storeId: string }) {
  const { user } = useAuth(); const parsedStoreId = Number(storeId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && hasBranchRole(user, parsedStoreId, ["admin", "cashier", "supervisor"]) ? <CashierPOS branchStoreId={parsedStoreId} /> : <AccessDenied />;
}

function BranchStatisticsRoute({ storeId }: { storeId: string }) {
  const { user } = useAuth(); const parsedStoreId = Number(storeId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && hasBranchRole(user, parsedStoreId, ["admin", "supervisor"]) ? <BranchStatistics storeId={parsedStoreId} /> : <AccessDenied />;
}

function BranchSuppliersRoute({ storeId }: { storeId: string }) {
  const { user } = useAuth(); const parsedStoreId = Number(storeId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && hasBranchRole(user, parsedStoreId, ["admin", "supervisor"]) ? <SupplierInvoiceManagement initialStoreId={parsedStoreId} /> : <AccessDenied />;
}

function BranchSupplierProfileRoute({ storeId, supplierId }: { storeId: string; supplierId: string }) {
  const { user } = useAuth(); const parsedStoreId = Number(storeId); const parsedSupplierId = Number(supplierId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && Number.isInteger(parsedSupplierId) && parsedSupplierId > 0 && hasBranchRole(user, parsedStoreId, ["admin", "supervisor"]) ? <SupplierProfile supplierId={parsedSupplierId} initialStoreId={parsedStoreId} /> : <AccessDenied />;
}

function BranchExpensesRoute({ storeId }: { storeId: string }) {
  const { user } = useAuth(); const parsedStoreId = Number(storeId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && hasBranchRole(user, parsedStoreId, ["admin", "supervisor"]) ? <ExpenseManagement initialStoreId={parsedStoreId} /> : <AccessDenied />;
}

function BranchCashOutRoute({ storeId }: { storeId: string }) {
  const { user } = useAuth(); const parsedStoreId = Number(storeId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && hasBranchRole(user, parsedStoreId, ["admin", "supervisor"]) ? <CashOutManagement initialStoreId={parsedStoreId} /> : <AccessDenied />;
}

function BranchProductDetailRoute({ storeId, productId }: { storeId: string; productId: string }) {
  const { user } = useAuth(); const parsedStoreId = Number(storeId); const parsedProductId = Number(productId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && Number.isInteger(parsedProductId) && parsedProductId > 0 && hasBranchRole(user, parsedStoreId, ["admin", "cashier", "stock_manager", "supervisor"]) ? <ProductDetails productId={parsedProductId} /> : <AccessDenied />;
}

function EnterpriseRoute({ view, roles }: { view: "branches" | "operations" | "customers"; roles: string[] }) {
  const { user } = useAuth();
  return user && (isSuperAdmin(user) || roles.includes(user.role)) ? <EnterpriseOperations view={view} /> : <AccessDenied />;
}

function BranchOperationsRoute({ storeId }: { storeId: string }) {
  const { user } = useAuth(); const parsedStoreId = Number(storeId);
  return Number.isInteger(parsedStoreId) && parsedStoreId > 0 && hasBranchRole(user, parsedStoreId, ["admin", "supervisor"]) ? <EnterpriseOperations view="operations" initialStoreId={parsedStoreId} /> : <AccessDenied />;
}

function AccessDenied() { return <div className="mx-auto flex min-h-[60vh] max-w-xl items-center"><div className="w-full rounded-[1.5rem] bg-white p-8 text-center shadow-[0_18px_48px_-28px_rgba(18,36,30,.35)]"><h1 className="font-display text-2xl font-bold text-[#12241e]">Access restricted</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Your assigned staff role is not permitted to open this workspace.</p></div></div>; }

function Router() {
  return <Switch><Route path="/" component={WorkspaceHome} /><Route path="/customers/:customerId">{params => <CustomerProfileRoute customerId={params.customerId} />}</Route><Route path="/customers" component={CustomerDirectoryRoute} /><Route path="/global/statistics" component={GlobalStatisticsRoute} /><Route path="/global/suppliers/:supplierId">{params => <GlobalSupplierProfileRoute supplierId={params.supplierId} />}</Route><Route path="/global/suppliers" component={GlobalSuppliersRoute} /><Route path="/global/expenses" component={GlobalExpensesRoute} /><Route path="/global/cash-out" component={GlobalCashOutRoute} /><Route path="/invoice" component={AdminInvoiceRoute} /><Route path="/admin/invoice-import" component={AdminInvoiceRoute} /><Route path="/invoices/new" component={AdminInvoiceRoute} /><Route path="/preview/ocr-space" component={OcrSpaceTestRoute} /><Route path="/branches/:storeId/product/:productId">{params => <BranchProductDetailRoute storeId={params.storeId} productId={params.productId} />}</Route><Route path="/branches/:storeId/products">{params => <AdminBranchProductsRoute storeId={params.storeId} />}</Route><Route path="/branches/:storeId/available-products">{params => <BranchAvailableProductsRoute storeId={params.storeId} />}</Route><Route path="/branches/:storeId/statistics">{params => <BranchStatisticsRoute storeId={params.storeId} />}</Route><Route path="/branches/:storeId/suppliers/:supplierId">{params => <BranchSupplierProfileRoute storeId={params.storeId} supplierId={params.supplierId} />}</Route><Route path="/branches/:storeId/suppliers">{params => <BranchSuppliersRoute storeId={params.storeId} />}</Route><Route path="/branches/:storeId/expenses">{params => <BranchExpensesRoute storeId={params.storeId} />}</Route><Route path="/branches/:storeId/cash-out">{params => <BranchCashOutRoute storeId={params.storeId} />}</Route><Route path="/branches/:storeId/operations">{params => <BranchOperationsRoute storeId={params.storeId} />}</Route><Route path="/branches/:storeId/invoice-import">{params => <AdminBranchInvoiceRoute storeId={params.storeId} />}</Route><Route path="/branches/:storeId/pos">{params => <BranchPosRoute storeId={params.storeId} />}</Route><Route path="/branches/:storeId/staff">{params => <BranchStaffRoute storeId={params.storeId} />}</Route><Route path="/pos" component={AdminPosPreviewRoute} /><Route path="/admin/products" component={AdminProductsRoute} /><Route path="/admin/labels" component={AdminLabelsRoute} /><Route path="/admin/sales-history" component={AdminSalesHistoryRoute} /><Route path="/admin/staff" component={AdminStaffRoute} /><Route path="/admin/branches">{() => <EnterpriseRoute view="branches" roles={["admin"]} />}</Route><Route path="/operations">{() => <EnterpriseRoute view="operations" roles={["admin", "supervisor"]} />}</Route><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><Toaster /><DashboardLayout><Router /></DashboardLayout></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
