import type { LucideIcon } from "lucide-react";

// Categories for organizing metrics
export type MetricCategory = "nutrition" | "whoop" | "exercise" | "supplements" | "habits";

// Static metric definition (never changes)
export interface MetricDefinition {
  key: string;
  label: string;
  category: MetricCategory;
  unit: string;
  color: string;
  decimals: number;
  icon: LucideIcon;
}

// User's preference for a metric (stored in database)
export interface MetricPreference {
  id?: string;
  user_id: string;
  metric_key: string;
  is_enabled: boolean;
  sort_order: number;
}

// Combined: definition + user preference
export interface UserMetric {
  definition: MetricDefinition;
  preference: MetricPreference | null;
  isEnabled: boolean;
  sortOrder: number;
}
