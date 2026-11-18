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
type SortOrder = "added" | "due";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  // 機能追加前に保存されたタスクにはカテゴリがないので省略可能にする
  category?: Category;
  // 期日（"YYYY-MM-DD"）。期日なし・既存タスクは省略
  dueDate?: string;
  // 見積もり時間（分）。なし・既存タスクは省略
  estimateMin?: number;
  // これまでに計測した時間の合計（ミリ秒）。停止するたびに足していく
  spentMs?: number;
  // 計測中なら開始した時刻（ミリ秒）。保存するので再読み込みしても計測が続く
  startedAt?: number;
  // 完了にした日（"YYYY-MM-DD"）。「今日 片付けた分」の集計に使う
  completedAt?: string;
};

const ESTIMATE_OPTIONS = [5, 10, 15, 30, 45, 60, 90, 120];

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

// これまでの計測時間 ＋ 計測中ならその分
function elapsedMs(todo: Todo, now: number): number {
  const running = todo.startedAt ? Math.max(0, now - todo.startedAt) : 0;
  return (todo.spentMs ?? 0) + running;
}

// 計測を止めて、かかった時間を spentMs に足す
function stopTimer(todo: Todo, now: number): Todo {
  if (!todo.startedAt) return todo;
  const { startedAt, ...rest } = todo;
  return { ...rest, spentMs: (todo.spentMs ?? 0) + Math.max(0, now - startedAt) };
}

// 見積もりより早く終わった分（分）。完了・見積もりあり・計測ありのときだけ
function savedMinutes(todo: Todo): number {
  if (!todo.done || !todo.estimateMin || !todo.spentMs || todo.startedAt) {
    return 0;
  }
  return Math.max(0, Math.floor(todo.estimateMin - todo.spentMs / 60000));
}

// 経過時間のリアルタイム表示 "3:05" / "1:02:05"
function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// 分数の表示 "45分" / "1時間30分"
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

// 計測した時間の表示。1分に満たないときは「1分未満」
function formatSpent(ms: number): string {
  return ms < 60000 ? "1分未満" : formatMinutes(Math.floor(ms / 60000));
}

const STORAGE_KEY = "todo-next:todos";
const SORT_KEY = "todo-next:sort";
const TOAST_MS = 2000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function isDateString(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

// 現在時刻（ミリ秒）。イベントハンドラとエフェクトの中からだけ呼ぶ
function currentTime(): number {
  return Date.now();
}

// 端末の時刻で「今日」を "YYYY-MM-DD" にする（UTC だと日本時間の朝にずれるため）
function todayString(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// "2026-11-25" → "11/25（水）"
function formatDue(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}（${weekday}）`;
}

const CATEGORY_IDS: Category[] = ["work", "home", "kids"];

// カテゴリごとの表示。色だけに頼らず、アイコンと文字でも区別する
const CATEGORIES: Record<
  Category,
  { label: string; Icon: () => ReactElement; iconColor: string; chip: string }
> = {
  work: {
    label: "仕事",
    Icon: BriefcaseIcon,
    iconColor: "text-blue-700 dark:text-blue-300",
    chip: "peer-checked:border-blue-700 peer-checked:bg-blue-50 peer-checked:text-blue-900 dark:peer-checked:border-blue-400 dark:peer-checked:bg-blue-950 dark:peer-checked:text-blue-100",
  },
  home: {
    label: "家",
    Icon: HouseIcon,
    iconColor: "text-emerald-700 dark:text-emerald-300",
    chip: "peer-checked:border-emerald-700 peer-checked:bg-emerald-50 peer-checked:text-emerald-900 dark:peer-checked:border-emerald-400 dark:peer-checked:bg-emerald-950 dark:peer-checked:text-emerald-100",
  },
  kids: {
    label: "子ども",
    Icon: ChildIcon,
    iconColor: "text-orange-700 dark:text-orange-300",
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
        ...(isDateString(t.dueDate) ? { dueDate: t.dueDate } : {}),
        ...(isPositiveNumber(t.estimateMin)
          ? { estimateMin: Math.round(t.estimateMin) }
          : {}),
        ...(isPositiveNumber(t.spentMs) ? { spentMs: t.spentMs } : {}),
        // 完了済みのタスクが計測中のまま残っていたら無視する
        ...(isPositiveNumber(t.startedAt) && t.done !== true
          ? { startedAt: t.startedAt }
          : {}),
        ...(isDateString(t.completedAt) ? { completedAt: t.completedAt } : {}),
      },
    ];
  });
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4 shrink-0" aria-hidden="true">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4 shrink-0" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </svg>
  );
}

function HourglassIcon() {
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
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
    </svg>
  );
}

function StopwatchIcon() {
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
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M10 2h4M19 6l1.5-1.5" />
    </svg>
  );
}

function LeafIcon() {
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
      <path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z" />
      <path d="M5 19l7-7" />
    </svg>
  );
}

// 期日が近い順。期日なしは最後に回し、同じ期日どうしは追加順を保つ
function sortByDue(list: Todo[]): Todo[] {
  return list
    .map((todo, index) => ({ todo, index }))
    .sort((a, b) => {
      const da = a.todo.dueDate;
      const db = b.todo.dueDate;
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.index - b.index;
    })
    .map(({ todo }) => todo);
}

function CalendarIcon() {
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
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function ClockIcon() {
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
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function AlertIcon() {
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
      <path d="M12 3L2 20h20L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

// 期日の表示。「今日まで」「期限切れ」は色だけでなくアイコンと文字で示す
function DueBadge({
  dueDate,
  today,
  done,
}: {
  dueDate: string;
  today: string;
  done: boolean;
}) {
  const date = formatDue(dueDate);
  // 完了済みのタスクは急かさず、日付だけ出す
  // 「期限切れ」「今日まで」だけは塗りつぶし＋太字で目立たせる
  if (!done && dueDate < today) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-700 px-2 py-0.5 text-base font-bold text-white dark:bg-red-400 dark:text-zinc-950">
        <AlertIcon />
        期限切れ
        <span className="font-medium">{date}</span>
      </span>
    );
  }
  if (!done && dueDate === today) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-200 px-2 py-0.5 text-base font-bold text-amber-950 dark:bg-amber-300 dark:text-zinc-950">
        <ClockIcon />
        今日まで
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-base text-zinc-700 dark:text-zinc-300">
      <span className="text-zinc-500 dark:text-zinc-400">
        <CalendarIcon />
      </span>
      {date}まで
    </span>
  );
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
  const { label, Icon, iconColor } = CATEGORIES[category];
  // 枠なしの控えめな表示。アイコンだけカテゴリの色にする
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-base text-zinc-700 dark:text-zinc-300">
      <span className={iconColor}>
        <Icon />
      </span>
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
  const [dueDate, setDueDate] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("added");
  // 「今日」はブラウザ側で決める（サーバーとの時刻差・日付またぎに対応）
  const [today, setToday] = useState("");
  const [estimate, setEstimate] = useState(""); // "" は見積もりなし
  // 経過時間の表示用の「現在時刻」。計測中だけ 1 秒ごとに進める
  const [now, setNow] = useState(0);
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
    try {
      if (localStorage.getItem(SORT_KEY) === "due") setSortOrder("due");
    } catch {
      // 読めなければ追加順のまま
    }
    setToday(todayString());
    setNow(currentTime());
    setLoaded(true);
  }, []);

  // 計測中のタスクがあるときだけ、1 秒ごとに表示を更新する
  const anyRunning = todos.some((t) => t.startedAt);
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(currentTime()), 1000);
    return () => clearInterval(id);
  }, [anyRunning]);

  // アプリに戻ってきたとき、日付が変わっていれば「今日」を更新する
  useEffect(() => {
    const refresh = () => setToday(todayString());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const changeSortOrder = (order: SortOrder) => {
    setSortOrder(order);
    try {
      localStorage.setItem(SORT_KEY, order);
    } catch {
      // 保存できなくても並べ替え自体はできる
    }
  };

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
      {
        id: crypto.randomUUID(),
        text: trimmed,
        done: false,
        category,
        ...(isDateString(dueDate) ? { dueDate } : {}),
        ...(estimate ? { estimateMin: Number(estimate) } : {}),
      },
    ]);
    setInput("");
    // 期日・見積もりはタスクごとに違うので毎回リセット
    setDueDate("");
    setEstimate("");
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
    const ts = currentTime();
    const day = todayString();
    setTodos((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.done) {
          // 未完了に戻したら「完了した日」を消す
          // （undefined は JSON に保存されない）
          return { ...t, done: false, completedAt: undefined };
        }
        // 完了にしたら計測中の時間も記録して止める
        return { ...stopTimer(t, ts), done: true, completedAt: day };
      }),
    );
    setNow(ts);
  };

  // 開始：同時に計測できるのは 1 つだけ。ほかに計測中のタスクがあれば止める
  const startTodoTimer = (id: string) => {
    const ts = currentTime();
    setTodos((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, startedAt: ts } : stopTimer(t, ts),
      ),
    );
    setNow(ts);
  };

  const stopTodoTimer = (id: string) => {
    const ts = currentTime();
    const target = todos.find((t) => t.id === id);
    setTodos((prev) => prev.map((t) => (t.id === id ? stopTimer(t, ts) : t)));
    setNow(ts);
    if (target) {
      showToast(`${formatSpent(elapsedMs(target, ts))} 記録しました`);
    }
  };

  const deleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    showToast("削除しました");
  };

  const filteredTodos =
    filter === "all" ? todos : todos.filter((t) => t.category === filter);
  const visibleTodos =
    sortOrder === "due" ? sortByDue(filteredTodos) : filteredTodos;
  const remaining = visibleTodos.filter((t) => !t.done).length;

  // 今日片付けた分：今日完了したタスクの見積もり時間（見積もりなしは実際の時間）
  const doneTodayMin = todos
    .filter((t) => t.done && t.completedAt === today)
    .reduce(
      (sum, t) =>
        sum + (t.estimateMin ?? Math.floor((t.spentMs ?? 0) / 60000)),
      0,
    );
  const totalSavedMin = todos.reduce((sum, t) => sum + savedMinutes(t), 0);

  const filterOptions: { id: Filter; label: string }[] = [
    { id: "all", label: "すべて" },
    ...CATEGORY_IDS.map((id) => ({ id, label: CATEGORIES[id].label })),
  ];

  return (
    <div className="w-full max-w-xl text-base">
      <h1 className="mb-4 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
        やることリスト
      </h1>

      {/* 時間の見える化：今日の成果 */}
      <p className="mb-8 flex min-h-7 flex-wrap items-center gap-x-5 gap-y-1 text-base text-zinc-800 dark:text-zinc-200">
        {loaded && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-blue-700 dark:text-blue-300">
                <CheckIcon />
              </span>
              今日
              <strong className="text-xl tabular-nums">
                {formatMinutes(doneTodayMin)}
              </strong>
              ぶん片付けました
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-emerald-700 dark:text-emerald-300">
                <LeafIcon />
              </span>
              合計
              <strong className="text-xl tabular-nums">
                {formatMinutes(totalSavedMin)}
              </strong>
              節約
            </span>
          </>
        )}
      </p>

      {/* 追加エリア：うすい背景のカードにまとめる */}
      <section
        aria-label="タスクを追加"
        className="mb-12 rounded-2xl bg-zinc-100 p-4 sm:p-6 dark:bg-zinc-900"
      >
        {/* 入力欄 + 追加ボタン */}
        <div className="mb-5 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="やることを入力"
            aria-label="やること"
            enterKeyHint="done"
            className="min-h-12 min-w-0 flex-1 rounded-xl border-2 border-zinc-300 bg-white px-4 text-base text-zinc-900 placeholder:text-zinc-500 outline-none transition-colors focus:border-blue-600 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-400 dark:focus:border-blue-400"
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

        {/* 期日（なくても OK） */}
        <div className="mb-5">
          <label
            htmlFor="due-date"
            className="mb-2 block text-base font-medium text-zinc-800 dark:text-zinc-200"
          >
            期日<span className="font-normal">（なくても OK）</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="min-h-12 rounded-xl border-2 border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none transition-colors focus:border-blue-600 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:[color-scheme:dark] dark:focus:border-blue-400"
            />
            {dueDate && (
              <button
                type="button"
                onClick={() => setDueDate("")}
                className="min-h-11 min-w-11 cursor-pointer rounded-xl px-4 text-base font-medium text-zinc-700 underline underline-offset-4 transition hover:bg-zinc-200 active:scale-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                期日をなしにする
              </button>
            )}
          </div>
        </div>

        {/* 見積もり時間（なくても OK） */}
        <div className="mb-5">
          <label
            htmlFor="estimate"
            className="mb-2 block text-base font-medium text-zinc-800 dark:text-zinc-200"
          >
            見積もり時間<span className="font-normal">（なくても OK）</span>
          </label>
          <select
            id="estimate"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            className="min-h-12 cursor-pointer rounded-xl border-2 border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none transition-colors focus:border-blue-600 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:[color-scheme:dark] dark:focus:border-blue-400"
          >
            <option value="">なし</option>
            {ESTIMATE_OPTIONS.map((min) => (
              <option key={min} value={String(min)}>
                {formatMinutes(min)}
              </option>
            ))}
          </select>
        </div>

        {/* 追加するタスクのカテゴリ（1つ選ぶ） */}
        <fieldset>
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
                    className={`flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-zinc-300 bg-white px-4 text-base font-medium text-zinc-800 transition-colors hover:border-zinc-500 peer-checked:font-bold peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 ${chip}`}
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
      </section>

      {/* タスク一覧（読み込みが終わるまでは何も出さない） */}
      <section aria-labelledby="list-heading">
        <h2
          id="list-heading"
          className="mb-3 text-xl font-bold text-zinc-900 dark:text-zinc-50"
        >
          タスク一覧
        </h2>
        {loaded &&
          (todos.length === 0 ? (
            <p className="py-12 text-center text-base text-zinc-600 dark:text-zinc-400">
              まだタスクはありません
            </p>
          ) : (
            <>
              {/* 絞り込みタブ：選択中は下線＋太字で示す */}
              <div
                role="group"
                aria-label="カテゴリで絞り込み"
                className="flex border-b border-zinc-300 dark:border-zinc-700"
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
                      className={`-mb-px flex min-h-12 min-w-11 flex-1 cursor-pointer items-center justify-center gap-1 border-b-4 px-1 text-base transition-colors focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-blue-600 ${
                        active
                          ? "border-zinc-900 font-bold text-zinc-900 dark:border-zinc-50 dark:text-zinc-50"
                          : "border-transparent font-normal text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
                      }`}
                    >
                      {Icon && <Icon />}
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* 並び順（小さなプルダウン） */}
              <div className="flex items-center justify-end gap-2 py-2">
                <label
                  htmlFor="sort-order"
                  className="text-base text-zinc-700 dark:text-zinc-300"
                >
                  並び順
                </label>
                <select
                  id="sort-order"
                  value={sortOrder}
                  onChange={(e) => changeSortOrder(e.target.value as SortOrder)}
                  className="min-h-11 cursor-pointer rounded-lg border border-zinc-300 bg-white px-2 text-base text-zinc-900 outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:[color-scheme:dark]"
                >
                  <option value="added">追加順</option>
                  <option value="due">期日が近い順</option>
                </select>
              </div>

              {visibleTodos.length === 0 ? (
                <p className="py-12 text-center text-base text-zinc-600 dark:text-zinc-400">
                  「{filterOptions.find((f) => f.id === filter)?.label}
                  」のタスクはありません
                </p>
              ) : (
                <ul className="divide-y divide-zinc-200 border-y border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {visibleTodos.map((todo) => {
                    const running = Boolean(todo.startedAt);
                    const spent = elapsedMs(todo, now);
                    const saved = savedMinutes(todo);
                    const showTime =
                      !todo.done || Boolean(todo.estimateMin) || spent > 0;
                    return (
                      <li key={todo.id} className="py-2">
                        <div className="flex items-center gap-2">
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
                              {/* 既存のカテゴリなし・期日なしタスクはバッジを出さない */}
                              {(todo.category || todo.dueDate) && (
                                <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                  {todo.category && (
                                    <CategoryBadge category={todo.category} />
                                  )}
                                  {todo.dueDate && today && (
                                    <DueBadge
                                      dueDate={todo.dueDate}
                                      today={today}
                                      done={todo.done}
                                    />
                                  )}
                                </span>
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
                        </div>

                        {/* 時間の行：見積もり・実績・節約・開始／停止 */}
                        {showTime && (
                          <div className="mt-1 ml-14 flex flex-wrap items-center gap-x-4 gap-y-2">
                            {todo.estimateMin && (
                              <span className="inline-flex items-center gap-1 text-base text-zinc-700 dark:text-zinc-300">
                                <span className="text-zinc-500 dark:text-zinc-400">
                                  <HourglassIcon />
                                </span>
                                見積 {formatMinutes(todo.estimateMin)}
                              </span>
                            )}
                            {running ? (
                              <span
                                role="timer"
                                className="inline-flex items-center gap-1 text-base font-bold text-zinc-900 dark:text-zinc-50"
                              >
                                <StopwatchIcon />
                                計測中
                                <span className="tabular-nums">
                                  {formatClock(spent)}
                                </span>
                              </span>
                            ) : (
                              spent > 0 && (
                                <span className="inline-flex items-center gap-1 text-base text-zinc-700 dark:text-zinc-300">
                                  <span className="text-zinc-500 dark:text-zinc-400">
                                    <StopwatchIcon />
                                  </span>
                                  実績 {formatSpent(spent)}
                                </span>
                              )
                            )}
                            {saved > 0 && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-base font-bold text-emerald-900 dark:bg-emerald-300 dark:text-zinc-950">
                                <LeafIcon />
                                {formatMinutes(saved)} 節約！
                              </span>
                            )}
                            {!todo.done &&
                              (running ? (
                                <button
                                  type="button"
                                  onClick={() => stopTodoTimer(todo.id)}
                                  aria-label={`「${todo.text}」の計測を停止`}
                                  className="ml-auto flex min-h-11 min-w-11 cursor-pointer items-center gap-1.5 rounded-lg bg-zinc-900 px-4 text-base font-bold text-white transition hover:bg-zinc-700 active:scale-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                                >
                                  <StopIcon />
                                  停止
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => startTodoTimer(todo.id)}
                                  aria-label={`「${todo.text}」の計測を開始`}
                                  className="ml-auto flex min-h-11 min-w-11 cursor-pointer items-center gap-1.5 rounded-lg border-2 border-zinc-300 px-4 text-base font-medium text-zinc-800 transition hover:border-zinc-500 active:scale-95 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:text-zinc-200 dark:hover:border-zinc-400"
                                >
                                  <PlayIcon />
                                  開始
                                </button>
                              ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-6 text-right text-base text-zinc-700 dark:text-zinc-300">
                残り {remaining} 件
              </p>
            </>
          ))}
      </section>

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
