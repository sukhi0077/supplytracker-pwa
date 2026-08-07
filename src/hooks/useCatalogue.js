// src/hooks/useCatalogue.js
// React-query hooks over the repositories. One file keeps the wiring compact.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MasterDataRepository } from "../repositories/MasterDataRepository.js";
import { ItemRepository } from "../repositories/ItemRepository.js";
import { SupplierRepository } from "../repositories/SupplierRepository.js";
import { InvoiceRepository } from "../repositories/InvoiceRepository.js";
import { InvoiceDetailRepository } from "../repositories/InvoiceDetailRepository.js";
import { KsefMappingRepository } from "../repositories/KsefMappingRepository.js";
import { SalesRepository } from "../repositories/SalesRepository.js";
import { StockRepository } from "../repositories/StockRepository.js";
import { KsefJobRepository } from "../repositories/KsefJobRepository.js";
import { AnalyticsRepository } from "../repositories/AnalyticsRepository.js";

// ---- queries ---------------------------------------------------------------
export function useMasterData() {
  return useQuery({ queryKey: ["masterData"], queryFn: MasterDataRepository.getAll });
}
export function useItems() {
  return useQuery({ queryKey: ["items"], queryFn: ItemRepository.getAll });
}
export function useSuppliers() {
  return useQuery({ queryKey: ["suppliers"], queryFn: SupplierRepository.getAll });
}
export function useInvoices() {
  return useQuery({ queryKey: ["invoices"], queryFn: () => InvoiceRepository.getAll() });
}
export function useInvoice(id) {
  return useQuery({
    queryKey: ["invoice", id],
    queryFn: () => InvoiceRepository.getById(id),
    enabled: !!id,
  });
}
export function useOrderLog() {
  return useQuery({ queryKey: ["orderLog"], queryFn: () => InvoiceDetailRepository.getAll() });
}
export function useInvoiceLines(opts) {
  return useQuery({
    queryKey: ["invoiceLines", opts?.unmappedOnly || false, opts?.search || ""],
    queryFn: () => InvoiceRepository.getLines(opts),
  });
}
// The whole unmapped backlog, for the grouped view (the paged list on screen
// would group only its own 300 rows and understate every count).
export function useUnmappedLines(enabled = true) {
  return useQuery({
    queryKey: ["invoiceLines", "unmappedAll"],
    queryFn: InvoiceRepository.getAllUnmappedLines,
    enabled,
  });
}
// Counted in the DB, not from the loaded page — see countUnmappedLines.
export function useUnmappedCount() {
  return useQuery({ queryKey: ["invoiceLines", "unmappedCount"], queryFn: InvoiceRepository.countUnmappedLines });
}
export function useMappings() {
  return useQuery({ queryKey: ["ksefMappings"], queryFn: KsefMappingRepository.getAll });
}
export function useStockLevels() {
  return useQuery({ queryKey: ["stockLevels"], queryFn: StockRepository.getLevels });
}
export function useStockMovements() {
  return useQuery({ queryKey: ["stockMovements"], queryFn: () => StockRepository.recentMovements() });
}
export function useSales(month) {
  return useQuery({ queryKey: ["sales", month || "all"], queryFn: () => SalesRepository.getAll({ month }) });
}
export function useKsefJobs() {
  return useQuery({ queryKey: ["ksefJobs"], queryFn: () => KsefJobRepository.getRecent() });
}
export function usePurchaseAnalytics(from, to) {
  return useQuery({
    queryKey: ["analytics", from || "all", to || "all"],
    queryFn: () => AnalyticsRepository.getPurchaseData({ from, to }),
  });
}

// ---- small mutation helper -------------------------------------------------
function useInvalidating(fn, keys) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}

// ---- items -----------------------------------------------------------------
export const useAddItem = () => useInvalidating((item) => ItemRepository.add(item), ["items", "masterData"]);
export const useUpdateItem = () =>
  useInvalidating(({ id, patch }) => ItemRepository.update(id, patch), ["items", "masterData"]);
export const useSetItemActive = () =>
  useInvalidating(({ id, isActive }) => ItemRepository.setActive(id, isActive), ["items"]);
export const useRemoveItem = () => useInvalidating((id) => ItemRepository.remove(id), ["items"]);

// ---- suppliers -------------------------------------------------------------
export const useAddSupplier = () => useInvalidating((s) => SupplierRepository.add(s), ["suppliers"]);
export const useUpdateSupplier = () =>
  useInvalidating(({ id, patch }) => SupplierRepository.update(id, patch), ["suppliers"]);
export const useSetSupplierActive = () =>
  useInvalidating(({ id, isActive }) => SupplierRepository.setActive(id, isActive), ["suppliers"]);
export const useRemoveSupplier = () => useInvalidating((id) => SupplierRepository.remove(id), ["suppliers"]);

// ---- master data -----------------------------------------------------------
export const useAddCategory = () => useInvalidating((name) => MasterDataRepository.addCategory(name), ["masterData"]);
export const useAddSubCategory = () =>
  useInvalidating(({ categoryId, name }) => MasterDataRepository.addSubCategory(categoryId, name), ["masterData"]);
export const useAddUnit = () => useInvalidating((u) => MasterDataRepository.addUnit(u), ["masterData"]);
export const useUpdateCategory = () =>
  useInvalidating(({ id, name }) => MasterDataRepository.updateCategory(id, name), ["masterData", "items"]);
export const useUpdateSubCategory = () =>
  useInvalidating(({ id, patch }) => MasterDataRepository.updateSubCategory(id, patch), ["masterData", "items"]);
export const useRemoveCategory = () =>
  useInvalidating((id) => MasterDataRepository.removeCategory(id), ["masterData"]);
export const useRemoveSubCategory = () =>
  useInvalidating((id) => MasterDataRepository.removeSubCategory(id), ["masterData"]);

// ---- invoices --------------------------------------------------------------
// Anything that writes to invoices or invoice_lines has to drop "analytics"
// too: the dashboard aggregates those very rows, so remapping a line in
// Invoice details changed the data but left the dashboard serving its cached
// figures. Keep every invoice-touching mutation on this one list rather than
// hand-picking keys per hook — that's how the gap appeared.
const INVOICE_KEYS = ["invoices", "invoice", "invoiceLines", "analytics", "orderLog", "stockLevels"];

export const useCreateInvoice = () =>
  useInvalidating(({ header, lines }) => InvoiceRepository.createWithLines(header, lines), INVOICE_KEYS);
export const useUpdateInvoiceFull = () =>
  useInvalidating(({ id, header, lines }) => InvoiceRepository.updateWithLines(id, header, lines), INVOICE_KEYS);
export const useSetLineItem = () =>
  useInvalidating(({ lineId, itemId }) => InvoiceRepository.setLineItem(lineId, itemId), INVOICE_KEYS);
export const useRemapLine = () =>
  useInvalidating(({ lineId, patch }) => InvoiceRepository.remapLine(lineId, patch), INVOICE_KEYS);
export const useApplyLineMappings = () =>
  useInvalidating((groups) => InvoiceRepository.applyLineMappings(groups), INVOICE_KEYS);

// ---- order log -------------------------------------------------------------
export const useAddOrderLine = () => useInvalidating((row) => InvoiceDetailRepository.add(row), ["orderLog"]);
export const useRemoveOrderLine = () => useInvalidating((id) => InvoiceDetailRepository.remove(id), ["orderLog"]);

// ---- mappings --------------------------------------------------------------
// A mapping edit can rewrite invoice_lines (see applyToExistingLines), so the
// analytics / invoice caches have to go too — otherwise the dashboard keeps
// serving the numbers it computed before the change.
const MAPPING_KEYS = ["ksefMappings", "analytics", "invoices", "invoiceLines", "orderLog", "stockLevels"];

export const useAddMapping = () => useInvalidating((m) => KsefMappingRepository.add(m), MAPPING_KEYS);
export const useUpdateMapping = () =>
  useInvalidating(({ id, patch }) => KsefMappingRepository.update(id, patch), MAPPING_KEYS);
export const useRemoveMapping = () => useInvalidating((id) => KsefMappingRepository.remove(id), MAPPING_KEYS);
export const useApplyMappingToLines = () =>
  useInvalidating((m) => KsefMappingRepository.applyToExistingLines(m), MAPPING_KEYS);

// ---- stock -----------------------------------------------------------------
export const useAddMovement = () =>
  useInvalidating((m) => StockRepository.addMovement(m), ["stockLevels", "stockMovements"]);

// ---- sales -----------------------------------------------------------------
export const useImportSales = () => useInvalidating((records) => SalesRepository.importRecords(records), ["sales"]);
