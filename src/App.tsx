import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlarmClock, CheckCircle2, XCircle, RefreshCw, Clock, Settings2, Play, Square, Trophy, Flame } from 'lucide-react';
import { format, isAfter, isBefore, addDays, parse, set, differenceInMinutes, addMinutes } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { GoogleGenAI } from "@google/genai";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
type AlarmStatus = 'idle' | 'scheduled' | 'ringing' | 'solved';

interface AlarmConfig {
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  scheduledTime: string | null; // ISO string
}

interface MathProblem {
  a: number;
  b: number;
  answer: number;
}

export default function App() {
  // State
  const [config, setConfig] = useState<AlarmConfig>(() => {
    const saved = localStorage.getItem('math_alarm_config');
    return saved ? JSON.parse(saved) : { startTime: '07:00', endTime: '08:00', scheduledTime: null };
  });

  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('math_alarm_stats');
    return saved ? JSON.parse(saved) : { streak: 0, totalCorrect: 0 };
  });

  const [newtonImage, setNewtonImage] = useState<string | null>(() => {
    return localStorage.getItem('newton_avatar_image');
  });
  
  const [status, setStatus] = useState<AlarmStatus>('idle');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [problem, setProblem] = useState<MathProblem | null>(null);
  const [userAnswer, setUserAnswer] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Generate photorealistic Newton image if not present
  useEffect(() => {
    async function generateAvatar() {
      if (newtonImage || isGeneratingImage) return;
      
      setIsGeneratingImage(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              {
                text: 'A highly detailed, photorealistic oil painting portrait of Sir Isaac Newton in his 40s, looking wise and scholarly, dramatic lighting, 8k resolution, cinematic quality, period accurate clothing.',
              },
            ],
          },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            const imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            setNewtonImage(imageUrl);
            localStorage.setItem('newton_avatar_image', imageUrl);
            break;
          }
        }
      } catch (error) {
        console.error("Failed to generate Newton avatar:", error);
      } finally {
        setIsGeneratingImage(false);
      }
    }

    generateAvatar();
  }, [newtonImage, isGeneratingImage]);

  // Persistence
  useEffect(() => {
    localStorage.setItem('math_alarm_config', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('math_alarm_stats', JSON.stringify(stats));
  }, [stats]);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      // Check if it's time to ring
      if (status === 'scheduled' && config.scheduledTime) {
        const scheduled = new Date(config.scheduledTime);
        if (isAfter(now, scheduled)) {
          triggerAlarm();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [status, config.scheduledTime]);

  const generateProblem = useCallback(() => {
    const a = Math.floor(Math.random() * 11) + 2; // 2-12
    const b = Math.floor(Math.random() * 11) + 2; // 2-12
    setProblem({ a, b, answer: a * b });
    setUserAnswer('');
    setAttempts(0);
    setShowHint(false);
    setFeedback(null);
  }, []);

  const triggerAlarm = () => {
    setStatus('ringing');
    generateProblem();
    // In a real app, we'd play audio here. 
    // Browsers often block autoplay, so we'll need a user interaction first usually.
    // But for this demo, we'll try to play a beep or just show the UI.
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log("Audio play blocked", e));
    }
  };

  const scheduleAlarm = () => {
    const [startH, startM] = config.startTime.split(':').map(Number);
    const [endH, endM] = config.endTime.split(':').map(Number);
    
    let start = set(new Date(), { hours: startH, minutes: startM, seconds: 0, milliseconds: 0 });
    let end = set(new Date(), { hours: endH, minutes: endM, seconds: 0, milliseconds: 0 });

    // If end is before start, assume it's the next day
    if (isBefore(end, start)) {
      end = addDays(end, 1);
    }

    // If start is in the past, move the window to the next day
    if (isBefore(start, new Date())) {
      start = addDays(start, 1);
      end = addDays(end, 1);
    }

    const diff = differenceInMinutes(end, start);
    const randomOffset = Math.floor(Math.random() * (diff + 1));
    const scheduled = addMinutes(start, randomOffset);

    setConfig(prev => ({ ...prev, scheduledTime: scheduled.toISOString() }));
    setStatus('scheduled');
  };

  const cancelAlarm = () => {
    setStatus('idle');
    setConfig(prev => ({ ...prev, scheduledTime: null }));
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleSubmitAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!problem) return;

    const val = parseInt(userAnswer);
    if (val === problem.answer) {
      setFeedback('correct');
      setStats(prev => ({
        streak: prev.streak + 1,
        totalCorrect: prev.totalCorrect + 1
      }));
      setTimeout(() => {
        setStatus('idle');
        setConfig(prev => ({ ...prev, scheduledTime: null }));
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
        }
      }, 1000);
    } else {
      setFeedback('incorrect');
      setStats(prev => ({
        ...prev,
        streak: 0
      }));
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      if (newAttempts >= 3) {
        setShowHint(true);
      }
      setTimeout(() => setFeedback(null), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-emerald-100">
      {/* Audio element for alarm sound */}
      <audio 
        ref={audioRef} 
        loop 
        src="https://actions.google.com/sounds/v1/alarms/beep_loop.ogg" 
      />

      <main className="max-w-md mx-auto px-6 py-12">
        <header className="mb-12 text-center">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="inline-flex items-center justify-center w-24 h-24 bg-white rounded-[2rem] shadow-xl mb-6 border-4 border-white overflow-hidden ring-1 ring-black/5"
          >
            {newtonImage ? (
              <img 
                src={newtonImage} 
                alt="Isaac Newton" 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full bg-neutral-100 flex items-center justify-center animate-pulse">
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </motion.div>
          <h1 className="text-4xl font-bold tracking-tight mb-2 text-neutral-900">Pop Quiz</h1>
          <p className="text-neutral-500 text-sm font-medium italic">Are you ready for a pop quiz?</p>
        </header>

        <section className="space-y-6">
          {/* Current Time Display */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 text-center">
            <div className="text-5xl font-light tracking-tighter mb-1">
              {format(currentTime, 'HH:mm')}
            </div>
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-widest">
              {format(currentTime, 'EEEE, MMMM do')}
            </div>
          </div>

          {/* Stats Display */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <Flame className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Streak</p>
                <p className="text-lg font-semibold tabular-nums">{stats.streak}</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-black/5 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Trophy className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Total</p>
                <p className="text-lg font-semibold tabular-nums">{stats.totalCorrect}</p>
              </div>
            </div>
          </div>

          {/* Alarm Configuration */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <Settings2 className="w-4 h-4 text-neutral-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Time Window</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-neutral-500 ml-1">Earliest</label>
                <input 
                  type="time" 
                  value={config.startTime}
                  onChange={(e) => setConfig(prev => ({ ...prev, startTime: e.target.value }))}
                  disabled={status !== 'idle'}
                  className="w-full bg-neutral-50 border-none rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-emerald-500/20 transition-all disabled:opacity-50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-neutral-500 ml-1">Latest</label>
                <input 
                  type="time" 
                  value={config.endTime}
                  onChange={(e) => setConfig(prev => ({ ...prev, endTime: e.target.value }))}
                  disabled={status !== 'idle'}
                  className="w-full bg-neutral-50 border-none rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-emerald-500/20 transition-all disabled:opacity-50"
                />
              </div>
            </div>

            {status === 'idle' ? (
              <div className="space-y-3">
                <button 
                  onClick={scheduleAlarm}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-[0.98]"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Set Window Alarm
                </button>
                <button 
                  onClick={triggerAlarm}
                  className="w-full bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-500 font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <RefreshCw className="w-3 h-3" />
                  Practice
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                    <Clock className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-emerald-800 uppercase tracking-wide">Active Window</p>
                    <p className="text-sm text-emerald-600 font-semibold">{config.startTime} — {config.endTime}</p>
                  </div>
                </div>
                <button 
                  onClick={cancelAlarm}
                  className="w-full bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-600 font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Cancel Alarm
                </button>
              </div>
            )}
          </div>

          <div className="text-center px-4">
            <p className="text-xs text-neutral-400 leading-relaxed">
              The alarm will trigger at a random moment within your selected window. 
              You must solve a math problem to turn it off.
            </p>
          </div>
        </section>
      </main>

      {/* Ringing Overlay */}
      <AnimatePresence>
        {status === 'ringing' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6"
          >
            <motion.div 
              animate={{ 
                scale: [1, 1.05, 1],
                rotate: [0, -2, 2, 0]
              }}
              transition={{ 
                repeat: Infinity, 
                duration: 0.5 
              }}
              className="mb-12 w-32 h-32 rounded-[40px] overflow-hidden border-4 border-emerald-500 shadow-2xl relative"
            >
              {newtonImage ? (
                <img 
                  src={newtonImage} 
                  alt="Isaac Newton" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full bg-neutral-100 flex items-center justify-center animate-pulse">
                   <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </motion.div>

            <div className="w-full max-w-sm text-center space-y-8">
              <div>
                <h2 className="text-4xl font-light tracking-tight mb-2">Wake Up!</h2>
                <p className="text-neutral-500">Solve this to dismiss the alarm</p>
              </div>

              <motion.div 
                animate={feedback === 'incorrect' ? { x: [-10, 10, -10, 10, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="bg-neutral-50 p-10 rounded-[40px] border border-black/5 relative overflow-hidden"
              >
                {feedback === 'correct' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 bg-emerald-500 flex items-center justify-center z-10"
                  >
                    <CheckCircle2 className="w-20 h-20 text-white" />
                  </motion.div>
                )}
                
                {feedback === 'incorrect' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 bg-rose-500 flex items-center justify-center z-10"
                  >
                    <XCircle className="w-20 h-20 text-white" />
                  </motion.div>
                )}

                <div className="text-6xl font-medium tracking-tighter mb-8 tabular-nums">
                  {problem?.a} × {problem?.b}
                </div>

                <form onSubmit={handleSubmitAnswer} className="space-y-4">
                  <input 
                    autoFocus
                    type="number"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    placeholder="?"
                    className="w-full bg-white border-2 border-neutral-200 rounded-2xl px-4 py-6 text-4xl text-center focus:border-emerald-500 focus:ring-0 transition-all outline-none"
                  />
                  <button 
                    type="submit"
                    className="w-full bg-emerald-600 text-white font-bold py-5 rounded-2xl text-xl shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition-all"
                  >
                    Dismiss
                  </button>
                </form>
              </motion.div>

              {showHint && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-amber-800 text-sm font-medium"
                >
                  Hint: The answer is {problem?.answer}
                </motion.div>
              )}

              <div className="text-xs text-neutral-400 font-medium uppercase tracking-widest">
                Attempt {attempts} of 3
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
