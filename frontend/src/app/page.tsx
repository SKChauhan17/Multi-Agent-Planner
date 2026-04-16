"use client";

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Loader2, Sparkles, AlertCircle, CheckCircle2, Clock, Hourglass, Target, ChevronDown, Rocket, Sun, Moon, RotateCcw, Download } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utilities for Class Merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** TypeScript Types */
interface TaskRow {
  id: string;
  title: string;
  description: string;
  estimated_hours: number;
  priority: 'High' | 'Medium' | 'Low';
  status: 'todo' | 'in-progress' | 'done';
}

interface PlanResponse {
  review_summary: string;
  final_plan: {
    id: string;
    goal: string;
    tasks: TaskRow[];
  };
}

type LoadingPhase = 'none' | 'planning' | 'reviewing' | 'finalizing';
type ThemeMode = 'light' | 'dark';

// Framer motion variants for stagger
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 100 } },
};

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');

  const [goal, setGoal] = useState('');
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('none');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlanResponse | null>(null);

  const dashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem('multi-agent-theme');

    if (storedTheme === 'dark' || storedTheme === 'light') {
      setThemeMode(storedTheme);
    }

    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.toggle('dark', themeMode === 'dark');
    root.style.colorScheme = themeMode;
    window.localStorage.setItem('multi-agent-theme', themeMode);
  }, [mounted, themeMode]);

  const toggleTheme = () => {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const handleGenerate = async () => {
    if (!goal.trim()) return;
    
    setError(null);
    setResult(null);
    setLoadingPhase('planning');

    try {
      setTimeout(() => setLoadingPhase('reviewing'), 1500);
      setTimeout(() => setLoadingPhase('finalizing'), 3000);

      const response = await axios.post<PlanResponse>('http://localhost:8000/generate-plan', { goal });
      setResult(response.data);
    } catch (err: unknown) {
      console.error(err);
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || 'An unexpected error occurred while contacting AI services.');
      } else {
        setError((err as Error).message || 'An unexpected error occurred while contacting AI services.');
      }
    } finally {
      setLoadingPhase('none');
    }
  };

  const handleReset = () => {
    window.location.reload();
  };

  const handleExportPDF = () => {
    window.print();
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskRow['status']) => {
    if (!result) return;

    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        final_plan: {
          ...prev.final_plan,
          tasks: prev.final_plan.tasks.map((t) =>
            t.id === taskId ? { ...t, status: newStatus } : t
          ),
        },
      };
    });

    try {
      await axios.patch(`http://localhost:4000/api/tasks/${taskId}`, { status: newStatus });
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const tasks = result?.final_plan?.tasks || [];
  const visibleTasks = [...tasks].sort((left, right) => {
    const leftCompleted = left.status === 'done' ? 1 : 0;
    const rightCompleted = right.status === 'done' ? 1 : 0;
    return leftCompleted - rightCompleted;
  });
  const criticalRemainingCount = tasks.filter((task) => task.priority === 'High' && task.status !== 'done').length;
  // Make the total load update as tasks are done
  const totalHours = tasks.filter(t => t.status !== 'done').reduce((sum, t) => sum + t.estimated_hours, 0);
  const highPriorityCount = tasks.filter((t) => t.priority === 'High').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in-progress').length;
  const completedCount = tasks.filter((t) => t.status === 'done').length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
  const progressTone =
    completionRate < 20 ? 'text-rose-500 dark:text-rose-400' :
    completionRate < 40 ? 'text-orange-500 dark:text-orange-400' :
    completionRate < 60 ? 'text-amber-500 dark:text-amber-400' :
    completionRate < 80 ? 'text-cyan-500 dark:text-cyan-400' :
    'text-emerald-500 dark:text-emerald-400';

  const hasResult = result && loadingPhase === 'none';

  const formatSynopsis = (text: string) => {
    return text.split(/(\*\*.*?\*\*)/g).map((part, i) => 
      part.startsWith('**') && part.endsWith('**') 
        ? <strong key={i} className="font-semibold text-indigo-600 dark:text-cyan-400">{part.slice(2, -2)}</strong> 
        : part
    );
  };

  return (
    <motion.div layout className={cn(
      "min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500/30 dark:selection:bg-cyan-500/30 w-full relative overflow-clip",
      "flex flex-col lg:flex-row items-start relative print:bg-white print:!text-slate-900",
      !hasResult && "p-4 justify-center items-center"
    )}>
      <style>{`
        @media print {
          @page { margin: 1in; } /* Restores standard paper margins for all pages */
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Light Mode Blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 dark:opacity-0 transition-opacity duration-300 overflow-hidden">
        <div className="absolute top-[-10%] right-[-5%] w-[50vw] h-[50vw] bg-indigo-500/5 blur-[120px] rounded-full transform-gpu" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[40vw] h-[40vw] bg-purple-500/5 blur-[100px] rounded-full transform-gpu" />
      </div>

      {/* Midnight Aurora Background (Dark Mode Only) */}
      <div className="fixed inset-0 pointer-events-none z-0 hidden dark:block opacity-0 dark:opacity-100 transition-opacity duration-300">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-cyan-900/20 blur-[150px] rounded-full mix-blend-screen transform-gpu" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-blue-900/20 blur-[140px] rounded-full mix-blend-screen transform-gpu" />
      </div>

      {/* ── Absolute Theme Toggle ── */}
      <div className="absolute top-6 right-6 z-50 print:hidden">
        {mounted && (
          <button
            onClick={toggleTheme}
            className="relative flex items-center justify-center w-12 h-12 rounded-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-lg dark:shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:bg-slate-100 dark:hover:bg-white/10 transition-all text-slate-600 dark:text-slate-300 backdrop-blur-md"
            aria-label="Toggle theme"
          >
            <Sun className={cn("h-5 w-5 absolute transition-all duration-500", themeMode === 'dark' ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
            <Moon className={cn("h-5 w-5 absolute transition-all duration-500", themeMode === 'light' ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
          </button>
        )}
      </div>

      {/* ── LEFT COLUMN (Sticky/Fixed OR Centered) ──────────────────────── */}
      <motion.aside 
        layout
        transition={{ type: "spring", bounce: 0, duration: 0.7 }}
        className={cn(
          "relative z-10 flex flex-col print:hidden",
          hasResult 
            ? "w-full lg:w-[450px] xl:w-[500px] border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-white/10 lg:h-screen lg:sticky lg:top-0 overflow-y-auto p-6 lg:p-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)] bg-white dark:bg-slate-950/50 dark:backdrop-blur-3xl shrink-0" 
            : "w-full max-w-2xl bg-transparent border-none m-auto"
        )}
      >
        <motion.div layout className={cn("w-full flex flex-col", !hasResult && "items-center justify-center text-center")}>
          <motion.div layout className={cn("flex flex-col", hasResult ? "mb-10 items-start" : "mb-8 items-center text-center")}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-gradient-to-br dark:from-cyan-500/20 dark:to-blue-500/20 border border-indigo-100 dark:border-cyan-500/30 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.2)] dark:shadow-[0_0_20px_rgba(34,211,238,0.15)]">
                <Sparkles className="w-5 h-5 text-indigo-600 dark:text-cyan-400" />
              </div>
              <h1 className="font-extrabold tracking-tight text-xl text-slate-800 dark:text-white">
                Multi-Agent <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-cyan-400 dark:to-blue-400 font-bold">Task Architect</span>
              </h1>
            </div>

            {/* Action Bar (Only shows when results are present) */}
            <AnimatePresence>
              {hasResult && (
                <motion.div 
                  initial={{ opacity: 0, height: 0, marginTop: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginTop: 24 }}
                  className="flex items-center gap-3 w-full"
                >
                  <button 
                    onClick={handleReset}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all shadow-sm"
                  >
                    <RotateCcw className="w-4 h-4" /> Start Over
                  </button>
                  <button 
                    onClick={handleExportPDF}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-indigo-50 dark:bg-cyan-500/10 text-indigo-600 dark:text-cyan-400 hover:bg-indigo-100 dark:hover:bg-cyan-500/20 border border-indigo-200 dark:border-cyan-500/20 transition-all shadow-sm"
                  >
                    <Download className="w-4 h-4" /> Export PDF
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div layout className={cn("space-y-4 w-full", !hasResult && "flex flex-col items-center")}>
            <motion.div layout className={cn(!hasResult && "text-center max-w-xl mx-auto")}>
              <h2 className={cn("font-extrabold tracking-tight text-slate-900 dark:text-white mb-2", hasResult ? "text-3xl" : "text-4xl md:text-5xl leading-tight")}>
                Define <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-cyan-400 dark:to-blue-400">Target</span>
              </h2>
              <p className={cn("text-slate-500 dark:text-slate-400 leading-relaxed", hasResult ? "text-sm mb-4" : "text-base mt-2")}>
                Command our Generative Agents to construct a deeply optimized execution roadmap.
              </p>
            </motion.div>

            <motion.div layout className={cn("relative group w-full", !hasResult && "max-w-xl mt-6")}>
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-cyan-500 dark:to-blue-500 rounded-2xl blur opacity-20 dark:opacity-30 group-hover:opacity-40 transition duration-1000" />
              <div className="relative flex flex-col bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl dark:backdrop-blur-2xl border border-slate-200/50 dark:border-white/10 rounded-2xl overflow-hidden shadow-xl shadow-slate-200/50 dark:shadow-[0_0_40px_rgba(0,0,0,0.3)] transition-all group-focus-within:shadow-indigo-500/10 dark:group-focus-within:shadow-cyan-500/10">
                <textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Design a scalable social networking architecture..."
                  className="w-full bg-transparent resize-none outline-none p-5 text-base placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-0 text-slate-800 dark:text-white"
                  disabled={loadingPhase !== 'none'}
                  rows={hasResult ? 4 : 3}
                />
                <div className="bg-slate-50/80 dark:bg-slate-900/90 backdrop-blur-md p-4 border-t border-slate-100/80 dark:border-white/5 transition-colors">
                  <button
                    onClick={handleGenerate}
                    disabled={!goal.trim() || loadingPhase !== 'none'}
                    className="w-full relative overflow-hidden group/btn flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 dark:from-cyan-600 dark:to-blue-600 hover:from-indigo-700 hover:to-violet-700 dark:hover:from-cyan-500 dark:hover:to-blue-500 disabled:opacity-50 disabled:pointer-events-none text-white px-6 py-3.5 rounded-xl font-bold tracking-wide transition-all shadow-[0_4px_14px_rgba(79,70,229,0.3)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.4)] dark:shadow-[0_4px_14px_rgba(6,182,212,0.3)] dark:hover:shadow-[0_6px_20px_rgba(6,182,212,0.4)]"
                  >
                    {!hasResult && loadingPhase === 'none' && <Sparkles className="w-5 h-5 dark:text-cyan-200" />}
                    {loadingPhase !== 'none' ? 'Synthesizing...' : 'Generate Architecture'}
                  </button>
                </div>
              </div>
            </motion.div>

            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn("bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl p-4 flex gap-3 text-sm text-red-800 dark:text-red-200 w-full text-left", !hasResult && "max-w-xl")}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </motion.div>
            )}

            <AnimatePresence>
              {loadingPhase !== 'none' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={cn("w-full overflow-hidden flex justify-center mt-2", !hasResult && "max-w-xl")}
                >
                  <div className="bg-indigo-50 dark:bg-cyan-500/10 dark:backdrop-blur-xl border border-indigo-100 dark:border-cyan-500/20 rounded-xl p-4 flex items-center gap-4 text-indigo-700 dark:text-cyan-400 text-left w-full shadow-sm">
                    <Loader2 className="w-5 h-5 animate-spin shrink-0 text-indigo-600 dark:text-cyan-400" />
                    <span className="text-base font-semibold animate-pulse tracking-wide">
                      {loadingPhase === 'planning' && 'Planner formulating nodes...'}
                      {loadingPhase === 'reviewing' && 'Reviewer critiquing edges...'}
                      {loadingPhase === 'finalizing' && 'Synchronizing graph mutations...'}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {hasResult && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-8 relative w-full text-left bg-amber-50 dark:bg-slate-900 border border-amber-200/60 dark:border-slate-800 rounded-2xl p-6 shadow-xl shadow-amber-100/50 dark:shadow-none overflow-hidden"
                >
                  <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 to-amber-500 dark:to-amber-600 rounded-l-2xl z-10" />
                  <div className="flex items-center gap-2 mb-4 relative z-10">
                    <Sparkles className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                    <h3 className="text-xs font-bold text-amber-600 dark:text-amber-400 tracking-widest uppercase">Generative Synopsis</h3>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed relative z-10 font-medium whitespace-pre-wrap">
                    {formatSynopsis(result.review_summary)}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </motion.aside>

      {/* ── RIGHT COLUMN (Scrollable Tasks) ─────────────────────── */}
      <AnimatePresence>
        {hasResult && (
          <motion.main 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 60, damping: 15, delay: 0.1 }}
            className="flex-1 min-w-0 p-6 lg:p-12 overflow-y-auto relative z-10 w-full"
          >
            <div className="space-y-10 max-w-6xl mx-auto dark:bg-transparent w-full" ref={dashRef}>
              
              {/* Dynamic Metrics */}
              <div className="hidden print:block print:mb-8 print:pb-4 print:border-b print:border-slate-300">
                <h2 className="text-2xl font-bold print:text-slate-900 mb-2">Project Objective</h2>
                <p className="text-lg print:text-slate-700">{goal}</p>
              </div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="grid grid-cols-2 gap-4"
              >
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-[2rem] p-6 flex flex-col gap-2 transition-all hover:bg-white dark:hover:bg-slate-900/100 hover:shadow-2xl hover:shadow-blue-500/15 dark:hover:shadow-blue-900/30 hover:-translate-y-1 hover:border-blue-200 dark:hover:border-blue-800/50 shadow-lg shadow-slate-200/20 dark:shadow-none print:shadow-none print:bg-slate-900 print:border-slate-900 group">
                  <span className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2 print:text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors"><Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 print:text-slate-400 transition-transform group-hover:rotate-12" /> Total Load</span>
                  <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight print:!text-white">{totalHours} <span className="text-sm text-slate-400 dark:text-slate-500 font-semibold align-middle print:!text-slate-400">HRS</span></span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-[2rem] p-6 flex flex-col gap-2 transition-all hover:bg-white dark:hover:bg-slate-900/100 hover:shadow-2xl hover:shadow-purple-500/15 dark:hover:shadow-purple-900/30 hover:-translate-y-1 hover:border-purple-200 dark:hover:border-purple-800/50 shadow-lg shadow-slate-200/20 dark:shadow-none print:shadow-none print:bg-slate-900 print:border-slate-900 group">
                  <span className="text-purple-600 dark:text-purple-500/80 text-xs font-bold uppercase tracking-wider flex items-center gap-2 print:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-400 transition-colors"><Rocket className="w-3.5 h-3.5 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" /> In Progress</span>
                  <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight print:!text-white">{inProgressCount} <span className="text-sm text-slate-400 dark:text-slate-500 font-semibold align-middle print:!text-slate-400">ACTIVE</span></span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-[2rem] p-6 flex flex-col gap-2 transition-all hover:bg-white dark:hover:bg-slate-900/100 hover:shadow-2xl hover:shadow-rose-500/15 dark:hover:shadow-rose-900/30 hover:-translate-y-1 hover:border-rose-200 dark:hover:border-rose-800/50 shadow-lg shadow-slate-200/20 dark:shadow-none print:shadow-none print:bg-slate-900 print:border-slate-900 group">
                  <span className="text-rose-600 dark:text-rose-500/80 text-xs font-bold uppercase tracking-wider flex items-center gap-2 print:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-400 transition-colors"><AlertCircle className="w-3.5 h-3.5 transition-transform group-hover:scale-110" /> Critical Remaining</span>
                  <span className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight print:!text-white">{criticalRemainingCount} <span className="text-sm text-slate-400 dark:text-slate-500 font-semibold align-middle print:!text-slate-400">OPEN</span></span>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 rounded-[2rem] p-6 flex flex-col justify-center transition-all hover:bg-white dark:hover:bg-slate-900/100 hover:shadow-2xl hover:shadow-cyan-500/15 dark:hover:shadow-cyan-900/30 hover:-translate-y-1 hover:border-cyan-200 dark:hover:border-cyan-800/50 shadow-lg shadow-slate-200/20 dark:shadow-none print:shadow-none print:bg-slate-900 print:border-slate-900 group">
                  <span className="text-indigo-600 dark:text-cyan-400/80 text-xs font-bold uppercase tracking-wider flex items-center gap-2 print:text-cyan-400 mb-2 group-hover:text-indigo-700 dark:group-hover:text-cyan-300 transition-colors"><Target className="w-3.5 h-3.5 transition-transform group-hover:scale-110" /> Progress</span>
                  <span className={cn("text-3xl font-bold tracking-tight print:!text-white", progressTone)}>{completionRate}%</span>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-full mt-3 overflow-hidden print:hidden">
                    <motion.div 
                      className={cn("h-full rounded-full transition-all duration-1000", progressTone.includes('emerald') ? 'bg-emerald-500' : progressTone.includes('cyan') ? 'bg-cyan-500' : progressTone.includes('amber') ? 'bg-amber-500' : progressTone.includes('orange') ? 'bg-orange-500' : 'bg-rose-500')} 
                      initial={{ width: 0 }} 
                      animate={{ width: `${completionRate}%` }} 
                    />
                  </div>
                </div>
              </motion.div>

              {/* Tasks Grid */}
              <motion.div
                layout
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="flex flex-col gap-4 pb-24 w-full items-stretch"
              >
                {visibleTasks.map((task) => {
                  const isDone = task.status === 'done';
                  const isInProgress = task.status === 'in-progress';
                  const statusCardClasses = isDone
                    ? "border-emerald-200/70 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-500/10 opacity-85 shadow-sm shadow-emerald-100/60 dark:shadow-[0_0_20px_rgba(16,185,129,0.08)] print:bg-white print:border-slate-300 print:shadow-none"
                    : isInProgress
                      ? "border-purple-200/70 dark:border-purple-500/30 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md dark:shadow-[0_0_15px_rgba(168,85,247,0.05)] print:bg-white print:border-slate-300 print:shadow-none"
                      : "border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-slate-700 hover:shadow-xl dark:shadow-none shadow-slate-200/40 print:bg-white print:border-slate-300 print:shadow-none";

                  return (
                    <motion.div
                      key={task.id}
                      layout
                      variants={itemVariants}
                      className={cn(
                        "group w-full bg-white dark:bg-slate-900 border transition-all duration-300 rounded-[2rem] p-8 flex flex-col relative overflow-hidden print:break-inside-avoid shadow-lg hover:shadow-2xl hover:-translate-y-1",
                        statusCardClasses
                      )}
                    >
                      {/* Priority Accent Line */}
                      <div className={cn(
                        "absolute top-0 inset-x-0 h-1.5 opacity-90 dark:opacity-80 print:h-2 print:opacity-100",
                        isDone ? 'bg-gradient-to-r from-emerald-500 to-lime-400' :
                        isInProgress ? 'bg-gradient-to-r from-purple-500 to-fuchsia-400' :
                        task.priority === 'High' ? 'bg-gradient-to-r from-rose-500 to-red-400 dark:from-red-500 dark:to-rose-400' :
                        task.priority === 'Medium' ? 'bg-gradient-to-r from-amber-500 to-orange-400' : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                      )} />

                      <div className="flex items-start justify-between mb-5 mt-1 align-middle">
                        
                        {/* Custom Dropdown UI Wrapper */}
                        <div className="relative inline-block">
                          <select
                            value={task.status}
                            onChange={(e) => handleStatusChange(task.id, e.target.value as TaskRow['status'])}
                            className={cn(
                              "appearance-none text-xs font-bold px-4 py-2.5 pr-10 rounded-xl outline-none cursor-pointer border transition-all duration-300 shadow-sm dark:backdrop-blur-md print:bg-transparent print:border-none print:shadow-none print:p-0 print:text-slate-900 group-hover:shadow-md",
                              task.status === 'todo' ? "bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10" :
                              task.status === 'in-progress' ? "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30 hover:bg-purple-100 dark:hover:bg-purple-500/20" :       
                              "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
                            )}
                          >
                            <option value="todo" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">To Do</option>
                            <option value="in-progress" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">In Progress</option>
                            <option value="done" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Done</option>
                          </select>
                          <div className={cn("absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-80 dark:opacity-70 print:hidden transition-transform duration-300 group-hover:translate-y-[-40%]", task.status === 'todo' ? "text-slate-600 dark:text-inherit" : task.status === 'in-progress' ? "text-purple-700 dark:text-purple-300" : "text-emerald-700 dark:text-emerald-300")}>
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </div>

                        <span className={cn(
                          "text-[10px] uppercase tracking-widest font-extrabold px-3 py-1.5 rounded-[2rem] border bg-opacity-10 dark:backdrop-blur-sm transition-all duration-300 group-hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)]",
                          isDone ? "text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 print:text-emerald-700 print:bg-transparent print:border-emerald-500" :
                          task.priority === 'High' ? "text-rose-600 dark:text-red-400 border-rose-200 dark:border-red-500/30 bg-rose-50 dark:bg-red-500/10 print:text-rose-700 print:bg-transparent print:border-rose-500" :
                          task.priority === 'Medium' ? "text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 print:text-amber-700 print:bg-transparent print:border-amber-500" :
                          "text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 print:text-blue-700 print:bg-transparent print:border-blue-500"
                        )}>
                          {task.priority}
                        </span>
                      </div>

                      <h4 className={cn("text-xl font-bold mb-3 leading-snug transition-all print:text-slate-900 print:no-underline print:opacity-100", isDone ? "text-emerald-800 dark:text-emerald-100 line-through decoration-emerald-300 dark:decoration-emerald-400/60 print:text-emerald-900" : "text-slate-900 dark:text-white") }>
                        {task.title}
                      </h4>
                      
                      <p className={cn("text-sm leading-relaxed flex-grow print:text-slate-700", isDone ? "text-emerald-900/80 dark:text-emerald-100/80 print:text-emerald-800" : "text-slate-600 dark:text-slate-400") }>
                        {task.description}
                      </p>
                      
                      <div className="mt-8 pt-5 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-slate-500 dark:text-slate-400 text-sm font-semibold uppercase tracking-wider print:border-slate-200 print:text-slate-500">
                        <div className="flex items-center gap-2">
                          <Hourglass className={cn("w-4 h-4 print:text-slate-500", isDone ? "text-emerald-500/80 print:text-emerald-600" : "text-indigo-500/70")} />
                          <span className="print:text-slate-600">{task.estimated_hours} Hours</span>
                        </div>
                        
                        {isDone && <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 print:text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Executed</span>}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>

            </div>
          </motion.main>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
