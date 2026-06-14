// Configurable table component for admin screens.
// Renders rows on web/desktop as a fixed-header grid. On mobile it falls back
// to a card list — admin screens are web-only in practice but this keeps the
// component harmless when previewed in a simulator.
import { ReactNode, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "@/theme/goRide";

export interface AdminColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  width?: number;
}

interface AdminTableProps<T> {
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowPress?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  // Pagination (optional). Pass null to render all rows.
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (next: number) => void;
  } | null;
}

type SortDir = "asc" | "desc";

export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  onRowPress,
  loading,
  emptyMessage = "No data",
  pagination,
}: AdminTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const visibleRows = useMemo(() => {
    if (!sortKey) return rows;
    const sorted = [...rows].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return av - bv;
      }
      return String(av).localeCompare(String(bv));
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [rows, sortKey, sortDir]);

  const toggleSort = (col: AdminColumn<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setSortDir("asc");
    }
  };

  const renderCell = (col: AdminColumn<T>, row: T) => {
    if (col.render) return col.render(row);
    const val = (row as Record<string, unknown>)[col.key];
    return <Text style={styles.cellText}>{formatValue(val)}</Text>;
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.adminAccent} />
        </View>
      ) : visibleRows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{emptyMessage}</Text>
        </View>
      ) : (
        <ScrollView horizontal={false} style={styles.scroll}>
          <View style={{ minWidth: 600 }}>
            {/* Header */}
            <View style={[styles.row, styles.headerRow]}>
              {columns.map((col) => (
                <Pressable
                  key={col.key}
                  onPress={() => toggleSort(col)}
                  style={[styles.headerCell, col.width ? { width: col.width } : { flex: 1 }]}
                  disabled={!col.sortable}
                >
                  <Text style={styles.headerText}>
                    {col.header}
                    {col.sortable && sortKey === col.key ? (
                      <Text style={styles.sortArrow}>{sortDir === "asc" ? " ▲" : " ▼"}</Text>
                    ) : null}
                  </Text>
                </Pressable>
              ))}
            </View>
            {/* Body */}
            {visibleRows.map((row, idx) => (
              <Pressable
                key={rowKey(row)}
                onPress={() => onRowPress?.(row)}
                style={[
                  styles.row,
                  idx % 2 === 0 ? styles.rowEven : styles.rowOdd,
                  onRowPress && styles.rowClickable,
                ]}
              >
                {columns.map((col) => (
                  <View
                    key={col.key}
                    style={[styles.cell, col.width ? { width: col.width } : { flex: 1 }]}
                  >
                    {renderCell(col, row)}
                  </View>
                ))}
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {pagination ? (
        <View style={styles.pagination}>
          <Text style={styles.paginationInfo}>
            {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{" "}
            {pagination.total}
          </Text>
          <View style={styles.paginationButtons}>
            <Pressable
              onPress={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              style={[styles.pageBtn, pagination.page <= 1 && styles.pageBtnDisabled]}
            >
              <Text style={styles.pageBtnText}>Prev</Text>
            </Pressable>
            <Text style={styles.pageIndicator}>Page {pagination.page}</Text>
            <Pressable
              onPress={() => pagination.onPageChange(pagination.page + 1)}
              disabled={
                pagination.page * pagination.pageSize >= pagination.total
              }
              style={[
                styles.pageBtn,
                pagination.page * pagination.pageSize >= pagination.total &&
                  styles.pageBtnDisabled,
              ]}
            >
              <Text style={styles.pageBtnText}>Next</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function formatValue(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length.toString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.darkSecondary,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  scroll: { flex: 1 },
  center: { padding: 32, alignItems: "center" },
  empty: { color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "stretch" },
  headerRow: {
    backgroundColor: "#181A20",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
  },
  headerCell: { paddingHorizontal: 12, paddingVertical: 12 },
  headerText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sortArrow: { color: colors.adminAccent },
  rowEven: { backgroundColor: colors.darkSecondary },
  rowOdd: { backgroundColor: "#1C1F25" },
  rowClickable: {},
  cell: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: "center",
  },
  cellText: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#2A2D35",
  },
  paginationInfo: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  paginationButtons: { flexDirection: "row", alignItems: "center", gap: 8 },
  pageBtn: {
    backgroundColor: "#2A2D35",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  pageIndicator: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
});
