import { useRef, useState } from "react";

const STYLES = `
  .cb-root {
    position: fixed;
    bottom: 92px;
    left: 50%;
    width: clamp(300px, 90vw, 480px);
    z-index: 2100;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    transition: opacity 300ms ease-out, transform 300ms ease-out;
  }
  .cb-root.cb-hidden {
    opacity: 0;
    transform: translateX(-50%) translateY(8px);
    pointer-events: none;
  }
  .cb-root.cb-visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0px);
    pointer-events: auto;
  }
  .cb-inner {
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 0 14px;
    height: 48px;
    gap: 10px;
    transition: border-color 300ms ease-out;
  }
  .cb-inner:focus-within {
    border-color: rgba(255, 255, 255, 0.18);
  }
  .cb-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.85);
    caret-color: rgba(255, 255, 255, 0.5);
  }
  .cb-input::placeholder {
    color: rgba(255, 255, 255, 0.25);
  }
  .cb-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cb-send {
    background: none;
    border: none;
    cursor: pointer;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 16px;
    color: rgba(255, 255, 255, 0.45);
    padding: 4px 2px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 300ms ease-out;
  }
  .cb-send:hover:not(:disabled) {
    color: rgba(255, 255, 255, 0.85);
  }
  .cb-send:disabled {
    cursor: not-allowed;
  }
  @keyframes cb-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }
  .cb-cursor {
    display: inline-block;
    animation: cb-blink 1s ease-in-out infinite;
    color: rgba(255, 255, 255, 0.6);
  }
`;

interface ChatBoxProps {
  onSubmit: (text: string) => void;
  isThinking: boolean;
}

export function ChatBox({ onSubmit, isThinking }: ChatBoxProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const submit = () => {
    const text = value.trim();
    if (!text || isThinking) return;
    setValue("");
    onSubmit(text);
  };

  return (
    <>
      <style>{STYLES}</style>
      <div className="cb-root cb-visible">
        <div className="cb-inner">
          <input
            ref={inputRef}
            className="cb-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            disabled={isThinking}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="cb-send"
            onClick={submit}
            disabled={isThinking || !value.trim()}
            aria-label="Send message"
          >
            {isThinking ? <span className="cb-cursor">▋</span> : "→"}
          </button>
        </div>
      </div>
    </>
  );
}
