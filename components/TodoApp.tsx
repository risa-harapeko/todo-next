"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type Todo = {
  id: string;
  text: string;
  done: boolean;
};

const STORAGE_KEY = "todo-next:todos";
const TOAST_MS = 2000;

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

export default function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  // localStorage の読み込みが終わるまで保存しないためのフラグ
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 初回マウント時（ブラウザ側のみ）に localStorage から読み込む
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setTodos(parsed as Todo[]);
        }
      }
    } catch {
      // 壊れたデータは無視して空リストで始める
    }
    setLoaded(true);
  }, []);

  // todos が変わるたびに localStorage へ保存する
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
    } catch {
      // 容量超過・プライベートモード等は無視
    }
  }, [todos, loaded]);

  // アンマウント時にトーストのタイマーを止める
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  };

  const trimmed = input.trim();

  const addTodo = () => {
    if (!trimmed) return; // 空（空白のみ含む）は追加しない
    setTodos((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text: trimmed, done: false },
    ]);
    setInput("");
    showToast("追加しました");
    inputRef.current?.focus(); // 続けて入力できるように
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 日本語入力の変換確定の Enter では追加しない
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addTodo();
    }
  };

  const toggleTodo = (id: string) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  const deleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    showToast("削除しました");
  };

  const remaining = todos.filter((t) => !t.done).length;

  return (
    <div className="w-full max-w-xl text-base">
      <h1 className="mb-8 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
        やることリスト
      </h1>

      {/* 入力欄 + 追加ボタン */}
      <div className="mb-8 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="やることを入力"
          aria-label="やること"
          enterKeyHint="done"
          className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-zinc-300 bg-white px-4 text-base text-zinc-900 placeholder:text-zinc-500 outline-none transition-colors focus:border-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-400 dark:focus:border-blue-400"
        />
        <button
          type="button"
          onClick={addTodo}
          disabled={!trimmed}
          className="min-h-12 shrink-0 cursor-pointer rounded-xl bg-blue-700 px-5 text-base font-bold text-white transition hover:bg-blue-800 active:scale-95 active:bg-blue-900 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600 disabled:active:scale-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
        >
          追加
        </button>
      </div>

      {/* タスク一覧（読み込みが終わるまでは何も出さない） */}
      {loaded &&
        (todos.length === 0 ? (
          <p className="py-12 text-center text-base text-zinc-600 dark:text-zinc-400">
            まだタスクはありません
          </p>
        ) : (
          <>
            <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {todos.map((todo) => (
                <li key={todo.id} className="flex items-center gap-2 py-2">
                  {/* チェックボックスと文字全体が押せる範囲 */}
                  <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 pr-2">
                    <input
                      type="checkbox"
                      checked={todo.done}
                      onChange={() => toggleTodo(todo.id)}
                      className="peer sr-only"
                    />
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg peer-focus-visible:outline-3 peer-focus-visible:outline-blue-600">
                      <span
                        className={`flex size-7 items-center justify-center rounded-md border-2 transition-colors ${
                          todo.done
                            ? "border-blue-700 bg-blue-700 text-white dark:border-blue-400 dark:bg-blue-400 dark:text-zinc-950"
                            : "border-zinc-500 bg-white hover:border-blue-700 dark:border-zinc-400 dark:bg-zinc-900"
                        }`}
                      >
                        {todo.done && <CheckIcon />}
                      </span>
                    </span>
                    <span
                      className={`min-w-0 flex-1 break-words text-base leading-relaxed ${
                        todo.done
                          ? "text-zinc-600 line-through decoration-2 dark:text-zinc-400"
                          : "text-zinc-900 dark:text-zinc-50"
                      }`}
                    >
                      {todo.text}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => deleteTodo(todo.id)}
                    aria-label={`「${todo.text}」を削除`}
                    className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg px-3 text-base font-medium text-red-700 transition hover:bg-red-50 active:scale-95 active:bg-red-100 focus-visible:outline-3 focus-visible:outline-red-600 dark:text-red-300 dark:hover:bg-red-950 dark:active:bg-red-900"
                  >
                    <TrashIcon />
                    <span>削除</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-right text-base text-zinc-700 dark:text-zinc-300">
              残り {remaining} 件
            </p>
          </>
        ))}

      {/* 短いお知らせ（トースト）。読み上げソフトにも伝わるよう aria-live を付ける */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      >
        {toast && (
          <div className="rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
