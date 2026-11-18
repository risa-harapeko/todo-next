"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";

type Category = "work" | "home" | "kids";
type Filter = "all" | Category;

type Todo = {
  id: string;
  text: string;
  done: boolean;
  // 機能追加前に保存されたタスクにはカテゴリがないので省略可能にする
  category?: Category;
};

const STORAGE_KEY = "todo-next:todos";
const TOAST_MS = 2000;

const CATEGORY_IDS: Category[] = ["work", "home", "kids"];

// カテゴリごとの表示。色だけに頼らず、アイコンと文字でも区別する
const CATEGORIES: Record<
  Category,
  { label: string; Icon: () => ReactElement; badge: string; chip: string }
> = {
  work: {
    label: "仕事",
    Icon: BriefcaseIcon,
    badge:
      "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100",
    chip: "peer-checked:border-blue-700 peer-checked:bg-blue-50 peer-checked:text-blue-900 dark:peer-checked:border-blue-400 dark:peer-checked:bg-blue-950 dark:peer-checked:text-blue-100",
  },
  home: {
    label: "家",
    Icon: HouseIcon,
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
    chip: "peer-checked:border-emerald-700 peer-checked:bg-emerald-50 peer-checked:text-emerald-900 dark:peer-checked:border-emerald-400 dark:peer-checked:bg-emerald-950 dark:peer-checked:text-emerald-100",
  },
  kids: {
    label: "子ども",
    Icon: ChildIcon,
    badge:
      "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-100",
    chip: "peer-checked:border-orange-700 peer-checked:bg-orange-50 peer-checked:text-orange-900 dark:peer-checked:border-orange-400 dark:peer-checked:bg-orange-950 dark:peer-checked:text-orange-100",
  },
};

function isCategory(value: unknown): value is Category {
  return CATEGORY_IDS.includes(value as Category);
}

// 保存データを安全に読み直す。カテゴリがない・不正な値の場合は「カテゴリなし」として扱う
function normalizeTodos(data: unknown[]): Todo[] {
  return data.flatMap((item): Todo[] => {
    if (typeof item !== "object" || item === null) return [];
    const t = item as Record<string, unknown>;
    if (typeof t.id !== "string" || typeof t.text !== "string") return [];
    return [
      {
        id: t.id,
        text: t.text,
        done: t.done === true,
        ...(isCategory(t.category) ? { category: t.category } : {}),
      },
    ];
  });
}

function BriefcaseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </svg>
  );
}

function HouseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
      aria-hidden="true"
    >
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function ChildIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10h.01M15 10h.01" />
      <path d="M8.5 14.5a4 4 0 0 0 7 0" />
      <path d="M12 3c-1 1.5-.5 3 1 3" />
    </svg>
  );
}

function CategoryBadge({ category }: { category: Category }) {
  const { label, Icon, badge } = CATEGORIES[category];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-base font-medium ${badge}`}
    >
      <Icon />
      {label}
    </span>
  );
}

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
  const [category, setCategory] = useState<Category>("work");
  const [filter, setFilter] = useState<Filter>("all");
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
          setTodos(normalizeTodos(parsed));
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
      { id: crypto.randomUUID(), text: trimmed, done: false, category },
    ]);
    setInput("");
    // 絞り込み中で追加したタスクが見えなくなる場合は、そのカテゴリに切り替える
    if (filter !== "all" && filter !== category) setFilter(category);
    showToast(`「${CATEGORIES[category].label}」に追加しました`);
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

  const visibleTodos =
    filter === "all" ? todos : todos.filter((t) => t.category === filter);
  const remaining = visibleTodos.filter((t) => !t.done).length;

  const filterOptions: { id: Filter; label: string }[] = [
    { id: "all", label: "すべて" },
    ...CATEGORY_IDS.map((id) => ({ id, label: CATEGORIES[id].label })),
  ];

  return (
    <div className="w-full max-w-xl text-base">
      <h1 className="mb-8 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
        やることリスト
      </h1>

      {/* 入力欄 + 追加ボタン */}
      <div className="mb-4 flex gap-2">
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

      {/* 追加するタスクのカテゴリ（1つ選ぶ） */}
      <fieldset className="mb-8">
        <legend className="mb-2 text-base font-medium text-zinc-800 dark:text-zinc-200">
          カテゴリ
        </legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_IDS.map((id) => {
            const { label, Icon, chip } = CATEGORIES[id];
            const selected = category === id;
            return (
              <label key={id} className="cursor-pointer">
                <input
                  type="radio"
                  name="category"
                  value={id}
                  checked={selected}
                  onChange={() => setCategory(id)}
                  className="peer sr-only"
                />
                <span
                  className={`flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-zinc-300 bg-white px-4 text-base font-medium text-zinc-800 transition-colors hover:border-zinc-500 peer-checked:font-bold peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 ${chip}`}
                >
                  <Icon />
                  {label}
                  {/* 選択中は色に加えてチェックマークでも示す */}
                  {selected && <CheckIcon />}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* タスク一覧（読み込みが終わるまでは何も出さない） */}
      {loaded &&
        (todos.length === 0 ? (
          <p className="py-12 text-center text-base text-zinc-600 dark:text-zinc-400">
            まだタスクはありません
          </p>
        ) : (
          <>
            {/* 絞り込みボタン */}
            <div
              role="group"
              aria-label="カテゴリで絞り込み"
              className="mb-4 flex flex-wrap gap-2"
            >
              {filterOptions.map(({ id, label }) => {
                const active = filter === id;
                const Icon = id === "all" ? null : CATEGORIES[id].Icon;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    aria-pressed={active}
                    className={`flex min-h-11 min-w-11 cursor-pointer items-center gap-1.5 rounded-full border-2 px-4 text-base font-medium transition active:scale-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                      active
                        ? "border-zinc-900 bg-zinc-900 font-bold text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                    }`}
                  >
                    {Icon && <Icon />}
                    {label}
                  </button>
                );
              })}
            </div>

            {visibleTodos.length === 0 ? (
              <p className="py-12 text-center text-base text-zinc-600 dark:text-zinc-400">
                「{filterOptions.find((f) => f.id === filter)?.label}
                」のタスクはありません
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {visibleTodos.map((todo) => (
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
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-1 py-1">
                        {/* 既存のカテゴリなしタスクはバッジを出さない */}
                        {todo.category && (
                          <CategoryBadge category={todo.category} />
                        )}
                        <span
                          className={`min-w-0 break-words text-base leading-relaxed ${
                            todo.done
                              ? "text-zinc-600 line-through decoration-2 dark:text-zinc-400"
                              : "text-zinc-900 dark:text-zinc-50"
                          }`}
                        >
                          {todo.text}
                        </span>
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
            )}
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
