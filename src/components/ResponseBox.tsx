import { useEffect, useRef } from "react";

// bottom = chatbox bottom-gap (32px) + chatbox height (48px) + gap (8px) = 88px
const STYLES = `
  .rb-root {
    position: fixed;
    bottom: 88px;
    left: 50%;
    width: clamp(400px, 90vw, 680px);
    z-index: 39;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    opacity: 0;
    transform: translateX(-50%) translateY(8px);
    transition: opacity 300ms ease-out, transform 300ms ease-out;
    pointer-events: none;
  }
  .rb-root.rb-visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
    pointer-events: auto;
  }
  .rb-inner {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px 20px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.85);
    white-space: pre-wrap;
    line-height: 1.6;
    max-height: 34px;
    overflow-y: scroll;
    scrollbar-width: none;
  }
  .rb-inner::-webkit-scrollbar {
    display: none;
  }
`;

interface ResponseBoxProps {
  text: string;
  shown: boolean;
}

export function ResponseBox({ text, shown }: ResponseBoxProps) {
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (innerRef.current) {
      innerRef.current.scrollTop = innerRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <>
      <style>{STYLES}</style>
      <div className={`rb-root${shown ? " rb-visible" : ""}`}>
        <div className="rb-inner" ref={innerRef}>{text}</div>
      </div>
    </>
  );
}
