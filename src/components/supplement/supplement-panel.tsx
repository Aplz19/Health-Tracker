"use client";

import { useState, useMemo } from "react";
import { Search, Plus, Pill } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useApp } from "@/contexts/app-context";
import { useDate } from "@/contexts/date-context";
import { useSupplementLogs } from "@/hooks/use-supplement-logs";
import {
  SUPPLEMENT_LIBRARY,
  getSupplementCategories,
  type SupplementLibraryItem,
} from "@/lib/supplements/library";
import { format } from "date-fns";

export function SupplementPanel() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSupplement, setSelectedSupplement] = useState<SupplementLibraryItem | null>(null);
  const [amount, setAmount] = useState("");

  const { closeSupplementLibrary } = useApp();
  const { selectedDate } = useDate();
  const dateString = format(selectedDate, "yyyy-MM-dd");
  const { addLog } = useSupplementLogs(dateString);

  const categories = getSupplementCategories();

  const filteredSupplements = useMemo(() => {
    let results = SUPPLEMENT_LIBRARY;

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      results = results.filter(
        (s) =>
          s.name.toLowerCase().includes(lowerQuery) ||
          s.category.toLowerCase().includes(lowerQuery)
      );
    }

    if (selectedCategory) {
      results = results.filter((s) => s.category === selectedCategory);
    }

    return results;
  }, [searchQuery, selectedCategory]);

  const handleSelectSupplement = (supplement: SupplementLibraryItem) => {
    setSelectedSupplement(supplement);
    setAmount(supplement.defaultAmount.toString());
  };

  const handleAddSupplement = async () => {
    if (!selectedSupplement || !amount) return;

    try {
      await addLog(
        selectedSupplement.name,
        parseFloat(amount),
        selectedSupplement.unit
      );
      setSelectedSupplement(null);
      setAmount("");
      closeSupplementLibrary();
    } catch (err) {
      console.error("Failed to add supplement:", err);
    }
  };

  // Show add form if supplement is selected
  if (selectedSupplement) {
    return (
      <div className="p-4 space-y-6">
        <button
          onClick={() => setSelectedSupplement(null)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to list
        </button>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Pill className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{selectedSupplement.name}</h2>
              <p className="text-sm text-muted-foreground">{selectedSupplement.category}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-24 text-center"
                min={0}
                step="any"
              />
              <span className="text-muted-foreground">{selectedSupplement.unit}</span>
            </div>
          </div>

          <Button onClick={handleAddSupplement} className="w-full" size="lg">
            <Plus className="w-4 h-4 mr-2" />
            Add to Today
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search supplements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Category filters */}
      <div className="px-4 py-2 border-b">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-2">
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="shrink-0"
            >
              All
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category)}
                className="shrink-0"
              >
                {category}
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Supplement list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {filteredSupplements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No supplements found
            </div>
          ) : (
            filteredSupplements.map((supplement) => (
              <button
                key={supplement.name}
                onClick={() => handleSelectSupplement(supplement)}
                className="w-full flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Pill className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{supplement.name}</p>
                    <p className="text-xs text-muted-foreground">{supplement.category}</p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {supplement.defaultAmount} {supplement.unit}
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
