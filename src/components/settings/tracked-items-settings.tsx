"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Plus, Trash2, Pill, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useTrackedItems,
  type TrackedItem,
  type TrackedItemKind,
} from "@/hooks/use-tracked-items";
import { SUPPLEMENT_DEFINITIONS } from "@/lib/supplements/config";

// Manage supplements and medications. Both live in one table with a `kind`
// discriminator, so this is one component with two sections rather than two
// subsystems. See NOTES_supplements_medications_migration.md.

function itemIcon(item: TrackedItem) {
  const def = item.legacy_key
    ? SUPPLEMENT_DEFINITIONS.find((d) => d.key === item.legacy_key)
    : undefined;
  return { Icon: def?.icon ?? Pill, color: def?.color ?? "text-primary" };
}

function ItemRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: TrackedItem;
  onUpdate: (updates: Partial<TrackedItem>) => void;
  onDelete: () => void;
}) {
  const { Icon, color } = itemIcon(item);
  const [expanded, setExpanded] = useState(false);
  const [dose, setDose] = useState(String(item.dose_amount ?? ""));
  const [perDay, setPerDay] = useState(String(item.doses_per_day));

  const isMedication = item.kind === "medication";

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <Icon className={"h-4 w-4 shrink-0 " + color} />
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="block truncate text-sm font-medium">{item.name}</span>
          <span className="block text-xs text-muted-foreground">
            {item.dose_amount ? item.dose_amount + " " + item.unit : item.unit}
            {item.doses_per_day > 1 ? " × " + item.doses_per_day + "/day" : ""}
          </span>
        </button>
        <Switch
          checked={item.is_enabled}
          onCheckedChange={(checked) => onUpdate({ is_enabled: checked })}
          aria-label={"Track " + item.name}
        />
      </div>

      {expanded && (
        <div className="space-y-3 border-t px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">
                {isMedication ? "Strength per dose" : "Amount"}
              </Label>
              <Input
                type="number"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                onBlur={() =>
                  onUpdate({ dose_amount: dose ? parseFloat(dose) : null })
                }
                className="mt-1 h-8"
                min={0}
              />
            </div>
            <div>
              <Label className="text-xs">Doses per day</Label>
              <Input
                type="number"
                value={perDay}
                onChange={(e) => setPerDay(e.target.value)}
                onBlur={() =>
                  onUpdate({ doses_per_day: Math.max(0, parseInt(perDay) || 1) })
                }
                className="mt-1 h-8"
                min={0}
                max={6}
              />
            </div>
          </div>

          {!isMedication && (
            <div className="flex items-center justify-between">
              <Label className="text-xs">Type the amount each day</Label>
              <Switch
                checked={item.tracking_mode === "manual"}
                onCheckedChange={(checked) =>
                  onUpdate({ tracking_mode: checked ? "manual" : "goal" })
                }
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Turning this off keeps every day already logged — it just stops
            showing on the dietary tab.
          </p>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete permanently (removes its history too)
          </Button>
        </div>
      )}
    </div>
  );
}

function AddItemForm({
  kind,
  onCreate,
  onCancel,
}: {
  kind: TrackedItemKind;
  onCreate: (input: {
    name: string;
    unit: string;
    dose_amount: number | null;
    doses_per_day: number;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(kind === "medication" ? "mg" : "mg");
  const [dose, setDose] = useState("");
  const [perDay, setPerDay] = useState("1");
  const [isSaving, setIsSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await onCreate({
        name: name.trim(),
        unit: unit.trim() || "mg",
        dose_amount: dose ? parseFloat(dose) : null,
        doses_per_day: Math.max(0, parseInt(perDay) || 1),
      });
      onCancel();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div>
        <Label className="text-xs">Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={
            kind === "medication" ? "e.g. Bupropion HCl SR" : "e.g. Ashwagandha"
          }
          className="mt-1 h-8"
          autoFocus
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Strength</Label>
          <Input
            type="number"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            placeholder="100"
            className="mt-1 h-8"
            min={0}
          />
        </div>
        <div>
          <Label className="text-xs">Unit</Label>
          <Input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="mg"
            className="mt-1 h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Per day</Label>
          <Input
            type="number"
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            className="mt-1 h-8"
            min={0}
            max={6}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={submit}
          disabled={!name.trim() || isSaving}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
        </Button>
      </div>
    </div>
  );
}

export function TrackedItemsSettings() {
  const today = format(new Date(), "yyyy-MM-dd");
  const {
    supplements,
    medications,
    available,
    isLoading,
    createItem,
    updateItem,
    deleteItem,
  } = useTrackedItems(today);

  const [adding, setAdding] = useState<TrackedItemKind | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!available) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Run <code>sql/add_tracked_items.sql</code> in Supabase to enable
        supplements and medications.
      </div>
    );
  }

  const section = (
    kind: TrackedItemKind,
    title: string,
    items: TrackedItem[],
    empty: string
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        {adding !== kind && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAdding(kind)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        )}
      </div>

      {adding === kind && (
        <AddItemForm
          kind={kind}
          onCancel={() => setAdding(null)}
          onCreate={async (input) => {
            await createItem({
              ...input,
              kind,
              is_enabled: true,
              // Medications are always checkbox-based: the configured dose is
              // what gets logged, so it's never re-typed.
              tracking_mode: "goal",
              goal_amount: input.dose_amount,
              sort_order: 999,
            });
          }}
        />
      )}

      {items.length === 0 && adding !== kind ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          {empty}
        </p>
      ) : (
        items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            onUpdate={(updates) => {
              updateItem(item.id, updates).catch(() => {});
            }}
            onDelete={() => {
              deleteItem(item.id).catch(() => {});
            }}
          />
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-6 p-4">
      {section(
        "medication",
        "Medications",
        medications,
        "No medications. Add one to track it daily."
      )}
      {section(
        "supplement",
        "Supplements",
        supplements,
        "No supplements yet."
      )}
    </div>
  );
}
