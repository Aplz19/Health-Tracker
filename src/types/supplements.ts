import type { LucideIcon } from "lucide-react";

// Static supplement definition (never changes)
export interface SupplementDefinition {
  key: string;
  table: string;
  label: string;
  unit: string;
  icon: LucideIcon;
  color: string;
  defaultGoal: number;
  step?: number;
}

// User's preference for a supplement (stored in database)
export interface SupplementPreference {
  id?: string;
  user_id: string;
  supplement_key: string;
  is_enabled: boolean;
  tracking_mode: "manual" | "goal";
  goal_amount: number | null;
  sort_order: number;
}

// Combined: definition + user preference
export interface UserSupplement {
  definition: SupplementDefinition;
  preference: SupplementPreference | null;
  // Computed convenience fields
  isEnabled: boolean;
  trackingMode: "manual" | "goal";
  goalAmount: number;
  sortOrder: number;
}
