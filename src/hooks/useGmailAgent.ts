/**
 * useGmailAgent — React hook that wraps every gmailAgent operation.
 *
 * Two-phase canvas pattern:
 *   Phase 1 (instant):  clear canvas, spawn email-ui with isLoading:true skeleton
 *   Phase 2 (on data):  update the same widget id with real email data
 *
 * On error: despawn the skeleton, spawn a text-block with the error message.
 * Never throws — all errors surface via the returned `error` state.
 *
 * Usage:
 *   const { fetchInbox, isLoading, error } = useGmailAgent()
 */

import { useState, useCallback } from "react";
import { useCanvasStore } from "@/store/canvasStore";
import { gmailAgent, type GmailResult } from "@/ai/gmailAgent";

const INBOX_ID     = "gmail-inbox";
const INBOX_LAYOUT = { x: 5, y: 10, w: 90, h: 72 } as const;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGmailAgent(_dispatch?: unknown) {
  const [isLoading, setIsLoading] = useState(false);
  const [operation, setOperation] = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);

  /**
   * Wraps any gmailAgent operation with:
   *   - loading state management
   *   - Phase 1 skeleton spawn
   *   - Phase 2 data update (or error fallback)
   */
  const run = useCallback(
    async (op: string, fn: () => Promise<GmailResult>): Promise<GmailResult> => {
      const store = useCanvasStore.getState();
      setIsLoading(true);
      setOperation(op);
      setError(null);

      // ── Phase 1: spawn skeleton immediately ─────────────────────────────────
      store.clear();
      store.spawn({
        id:   INBOX_ID,
        type: "email-ui",
        ...INBOX_LAYOUT,
        data: { isLoading: true, emails: [] },
      });
      store.zoomCamera(INBOX_ID, 1.2);

      // ── Phase 2: fetch real data, update in place ───────────────────────────
      const result = await fn();

      if (result.error && result.emails.length === 0) {
        // Fallback: replace skeleton with an error card
        setError(result.error);
        store.despawn(INBOX_ID);
        store.resetCamera();
        store.spawn({
          id:   "gmail-error",
          type: "card",
          x: 20, y: 20, w: 60, h: 40,
          data: {
            title: "Gmail unavailable",
            body:  result.error,
          },
        });
      } else {
        // Success: swap skeleton data for real emails (no flicker — same widget id)
        store.update(INBOX_ID, {
          data: {
            isLoading:   false,
            emails:      result.emails,
            unreadCount: result.unreadCount,
            selectedId:  null,
          },
        });
      }

      setIsLoading(false);
      setOperation(null);
      return result;
    },
    []
  );

  return {
    isLoading,
    operation,
    error,

    fetchInbox:    (count?: number)                            =>
      run("fetchInbox",    () => gmailAgent.fetchInbox(count)),

    fetchUnread:   (count?: number)                            =>
      run("fetchUnread",   () => gmailAgent.fetchUnread(count)),

    searchEmails:  (query: string)                             =>
      run("searchEmails",  () => gmailAgent.searchEmails(query)),

    readEmail:     (id: string)                                =>
      run("readEmail",     () => gmailAgent.readEmail(id)),

    sendEmail:     (to: string, subject: string, body: string) =>
      run("sendEmail",     () => gmailAgent.sendEmail(to, subject, body)),

    replyToEmail:  (id: string, body: string)                  =>
      run("replyToEmail",  () => gmailAgent.replyToEmail(id, body)),

    summarizeInbox: ()                                         =>
      run("summarizeInbox", () => gmailAgent.summarizeInbox()),
  };
}
