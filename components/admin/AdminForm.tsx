// Declarative form renderer for the admin panel.
// Renders a list of fields and reports the gathered values back to the parent
// via the onChange callback. Designed to live inside AdminModal.
//
// Usage:
//   <AdminForm
//     fields={[
//       { name: "name", label: "Name", type: "text", required: true },
//       { name: "is_active", label: "Active", type: "boolean" },
//     ]}
//     values={form}
//     onChange={setForm}
//   />
import { StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/theme/goRide";
import { AdminToggle } from "./AdminToggle";

export type AdminFieldType =
  | "text"
  | "number"
  | "textarea"
  | "boolean"
  | "select"
  | "datetime";

export interface AdminFieldOption {
  label: string;
  value: string | number;
}

export interface AdminField {
  name: string;
  label: string;
  type: AdminFieldType;
  required?: boolean;
  placeholder?: string;
  options?: AdminFieldOption[]; // for select
  helpText?: string;
  step?: number; // for number
}

interface AdminFormProps {
  fields: AdminField[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

function isoToDatetimeLocal(iso?: string | null): string {
  if (!iso) return "";
  // Convert ISO to "YYYY-MM-DDTHH:mm" for input[type=datetime-local].
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminForm({ fields, values, onChange }: AdminFormProps) {
  const setField = (name: string, value: unknown) => {
    onChange({ ...values, [name]: value });
  };

  return (
    <View style={styles.container}>
      {fields.map((field) => {
        const key = field.name;
        const raw = values[field.name];
        const labelNode = (
          <Text style={styles.label}>
            {field.label}
            {field.required ? <Text style={styles.required}> *</Text> : null}
          </Text>
        );

        if (field.type === "boolean") {
          return (
            <View key={key} style={styles.field}>
              <AdminToggle
                value={Boolean(raw ?? false)}
                onValueChange={(v) => setField(field.name, v)}
                label={field.label}
              />
              {field.helpText ? (
                <Text style={styles.help}>{field.helpText}</Text>
              ) : null}
            </View>
          );
        }

        if (field.type === "select") {
          // Native select rendered as a styled TextInput on web via DOM.
          // Using a simple list of Pressable options for portability.
          const opts = field.options ?? [];
          return (
            <View key={key} style={styles.field}>
              {labelNode}
              <View style={styles.selectWrap}>
                {opts.map((opt) => {
                  const selected = raw === opt.value;
                  return (
                    <Text
                      key={String(opt.value)}
                      onPress={() => setField(field.name, opt.value)}
                      style={[styles.selectChip, selected && styles.selectChipActive]}
                    >
                      {opt.label}
                    </Text>
                  );
                })}
              </View>
            </View>
          );
        }

        if (field.type === "textarea") {
          return (
            <View key={key} style={styles.field}>
              {labelNode}
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder={field.placeholder}
                placeholderTextColor={colors.textDisabledDark}
                value={(raw as string) ?? ""}
                onChangeText={(v) => setField(field.name, v)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          );
        }

        if (field.type === "datetime") {
          const v = isoToDatetimeLocal((raw as string) ?? null);
          // On web, datetime-local input is far better than a Text input.
          // Use a ref-less DOM input via createElement on web; fallback on native.
          return (
            <View key={key} style={styles.field}>
              {labelNode}
              <input
                type="datetime-local"
                value={v}
                onChange={(e: { target: { value: string } }) => {
                  const next = e.target.value
                    ? new Date(e.target.value).toISOString()
                    : null;
                  setField(field.name, next);
                }}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "8px",
                  border: `1px solid #2A2D35`,
                  backgroundColor: "#181A20",
                  color: "#FFFFFF",
                  fontFamily: "Jakarta-Regular",
                  fontSize: "14px",
                }}
              />
            </View>
          );
        }

        // text | number
        return (
          <View key={key} style={styles.field}>
            {labelNode}
            <TextInput
              style={styles.input}
              placeholder={field.placeholder}
              placeholderTextColor={colors.textDisabledDark}
              value={raw === null || raw === undefined ? "" : String(raw)}
              onChangeText={(v) =>
                setField(
                  field.name,
                  field.type === "number" && v !== "" ? Number(v) : v,
                )
              }
              keyboardType={field.type === "number" ? "numeric" : "default"}
            />
            {field.helpText ? (
              <Text style={styles.help}>{field.helpText}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  field: { gap: 6 },
  label: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  required: { color: colors.danger },
  input: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
  },
  textarea: {
    minHeight: 90,
    paddingTop: 10,
  },
  help: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
  },
  selectWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  selectChip: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    color: colors.textSecondaryDark,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontFamily: "Jakarta-Regular",
    overflow: "hidden",
  },
  selectChipActive: {
    backgroundColor: colors.adminAccent,
    color: colors.white,
    borderColor: colors.adminAccent,
  },
});
