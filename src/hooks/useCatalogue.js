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

// ---- suppliers -------------------------------------------------------------
export const useAddSupplier = () => useInvalidating((s) => SupplierRepository.add(s), ["suppliers"]);
export const useUpdateSupplier = () =>
  useInvalidating(({ id, patch }) => SupplierRepository.update(id, patch), ["suppliers"]);
export const useSetSupplierActive = () =>
  useInvalidating(({ id, isActive }) => SupplierRepository.setActive(id, isActive), ["suppliers"]);

// ---- master data -----------------------------------------------------------
export const useAddCategory = () => useInvalidating((name) => MasterDataRepository.addCategory(name), ["masterData"]);
export const useAddSubCategory = () =>
  useInvalidating(({ categoryId, name }) => MasterDataRepository.addSubCategory(categoryId, name), ["masterData"]);
export const useAddUnit = () => useInvalidating((u) => MasterDataRepository.addUnit(u), ["masterData"]);

// ---- invoices --------------------------------------------------------------
export const useCreateInvoice = () =>
  useInvalidating(({ header, lines }) => InvoiceRepository.createWithLines(header, lines), ["invoices"]);

// ---- order log -------------------------------------------------------------
export const useAddOrderLine = () => useInvalidating((row) => InvoiceDetailRepository.add(row), ["orderLog"]);
export const useRemoveOrderLine = () => useInvalidating((id) => InvoiceDetailRepository.remove(id), ["orderLog"]);

// ---- mappings --------------------------------------------------------------
export const useAddMapping = () => useInvalidating((m) => KsefMappingRepository.add(m), ["ksefMappings"]);
export const useUpdateMapping = () =>
  useInvalidating(({ id, patch }) => KsefMappingRepository.update(id, patch), ["ksefMappings"]);
export const useRemoveMapping = () => useInvalidating((id) => KsefMappingRepository.remove(id), ["ksefMappings"]);

// ---- stock -----------------------------------------------------------------
export const useAddMovement = () =>
  useInvalidating((m) => StockRepository.addMovement(m), ["stockLevels", "stockMovements"]);

// ---- sales -----------------------------------------------------------------
export const useImportSales = () => useInvalidating((records) => SalesRepository.importRecords(records), ["sales"]);
