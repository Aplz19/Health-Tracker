"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, setCached } from "@/lib/client-cache";
import { isMissingSchemaError } from "@/lib/habits/logic";

// One free-text journal note per user per day (daily_notes table, part of
// habits v2). Gracefully hides itself when the migration is unapplied:
// `available` stays false and the tab simply doesn't render the note section.
// Saves on blur (caller invokes saveNote), optimistic, repo cache pattern.

export function useDailyNote(date: string) {
  const cacheKey = `daily_note:${date}`;
  const [note, setNoteState] = useState<string>(
    () => getCached<string>(cacheKey) ?? ""
  );
  const [available, setAvailable] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const cached = getCached<string>(cacheKey);
    setNoteState(cached ?? "");
    setIsLoading(cached === undefined);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data, error } = await supabase
          .from("daily_notes")
          .select("note")
          .eq("user_id", user.id)
          .eq("date", date)
          .single();

        if (cancelled) return;

        if (!error) {
          setAvailable(true);
          const value = (data?.note as string) ?? "";
          setNoteState(value);
          setCached(cacheKey, value);
        } else if (error.code === "PGRST116") {
          // Table exists, no note for this day yet.
          setAvailable(true);
          setNoteState("");
          setCached(cacheKey, "");
        } else if (isMissingSchemaError(error)) {
          setAvailable(false);
        }
        // Other errors: leave available=false; the note section stays hidden
        // rather than risking writes that can't persist.
      } catch {
        // Network/auth failure - keep hidden.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, cacheKey]);

  const setNote = useCallback(
    (value: string) => {
      setNoteState(value);
      setCached(cacheKey, value);
    },
    [cacheKey]
  );

  // Persist (call on blur). Optimistic state is already set via setNote.
  const saveNote = useCallback(
    async (value: string) => {
      if (!available) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { error } = await supabase.from("daily_notes").upsert(
          {
            user_id: user.id,
            date,
            note: value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,date" }
        );
        if (error) console.error("Failed to save daily note:", error);
      } catch (err) {
        console.error("Failed to save daily note:", err);
      }
    },
    [available, date]
  );

  return { note, setNote, saveNote, available, isLoading };
}
