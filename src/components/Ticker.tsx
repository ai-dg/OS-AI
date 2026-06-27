import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface TickerHandle {
  pushDelta(delta: string): void;
  completeSentence(): void;
  reset(): void;
}

interface TickerProps {
  interim?: string;
}

export const Ticker = forwardRef<TickerHandle, TickerProps>(function Ticker(
  { interim },
  ref
) {
  const [aiText, setAiText] = useState("");
  const [opacity, setOpacity] = useState(1);

  const isBusyRef = useRef(false);
  const pendingRef = useRef("");
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }

  useImperativeHandle(ref, () => ({
    pushDelta(delta: string) {
      if (isBusyRef.current) {
        pendingRef.current = delta;
      } else {
        setAiText(delta);
      }
    },
    completeSentence() {
      clearTimers();
      isBusyRef.current = true;
      // Hold the completed sentence for 600ms, then fade
      holdTimerRef.current = setTimeout(() => {
        setOpacity(0);
        // After 400ms fade-out completes, flush pending and reset
        fadeTimerRef.current = setTimeout(() => {
          setAiText(pendingRef.current);
          pendingRef.current = "";
          setOpacity(1);
          isBusyRef.current = false;
        }, 400);
      }, 600);
    },
    reset() {
      clearTimers();
      isBusyRef.current = false;
      pendingRef.current = "";
      setAiText("");
      setOpacity(1);
    },
  }));

  useEffect(() => () => clearTimers(), []);

  const displayText = interim || aiText;

  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 30,
        pointerEvents: "none",
        opacity,
        transition: "opacity 400ms ease-out",
        maxWidth: "600px",
        width: "calc(100% - 32px)",
      }}
    >
      {displayText && (
        <div
          style={{
            height: "48px",
            overflow: "hidden",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: "14px",
              color: "#ffffff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              width: "100%",
            }}
          >
            {displayText}
          </span>
        </div>
      )}
    </div>
  );
});
