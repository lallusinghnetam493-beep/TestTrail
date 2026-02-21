
import React, { useState, useEffect, useCallback } from 'react';
import { 
  User, 
  SubscriptionStatus, 
  Question, 
  TestResult, 
  AppConfig 
} from './types';
import { ICONS, COLORS } from './constants';
import { generateQuestions } from './services/geminiService';

// --- Local Storage Keys ---
const CONFIG_KEY = 'tt_config';
const RESULTS_KEY = 'tt_results';
const USERS_KEY = 'tt_users';
const CURRENT_USER_KEY = 'tt_current_user';

// --- Mock Initial Config ---
const DEFAULT_CONFIG: AppConfig = {
  upiId: '8839191411@ibl',
  subscriptionPrice: 100,
};

const App: React.FC = () => {
  // --- State ---
  const [currentPage, setCurrentPage] = useState<'home' | 'auth' | 'dashboard' | 'payment' | 'test' | 'result' | 'admin' | 'profile'>('home');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testLanguage, setTestLanguage] = useState<'English' | 'Hindi'>('English');

  // Test Session State
  const [currentTest, setCurrentTest] = useState<{
    topic: string;
    questions: Question[];
    isPro: boolean;
    language: string;
  } | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [lastResult, setLastResult] = useState<TestResult | null>(null);

  // --- Auth & Persistence Initialization ---
  useEffect(() => {
    const savedUser = localStorage.getItem(CURRENT_USER_KEY);
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
      setCurrentPage('dashboard');
    }

    const savedConfig = localStorage.getItem(CONFIG_KEY);
    if (savedConfig) setAppConfig(JSON.parse(savedConfig));

    const savedResults = localStorage.getItem(RESULTS_KEY);
    if (savedResults) setTestResults(JSON.parse(savedResults));
  }, []);

  // --- Local Auth Handlers ---
  const handleAuth = async (fullName: string, phone: string, pass: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const usersJson = localStorage.getItem(USERS_KEY);
      const users: User[] = usersJson ? JSON.parse(usersJson) : [];

      if (authMode === 'signup') {
        if (!fullName.trim() || !phone.trim() || !pass.trim()) {
          throw new Error('All fields are required!');
        }

        if (users.find(u => u.phone === phone)) {
          throw new Error('User with this phone already exists!');
        }

        const newUser: User = {
          id: Math.random().toString(36).substr(2, 9),
          fullName,
          phone,
          password: pass, // In a real app, never store plain text passwords
          subscription: SubscriptionStatus.FREE,
          trialsUsed: 0,
          isAdmin: phone === '9999999999' // Mock admin condition
        };

        users.push(newUser);
        localStorage.setItem(USERS_KEY, JSON.stringify(users));
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
        setCurrentUser(newUser);
        setCurrentPage('dashboard');
      } else {
        const user = users.find(u => u.phone === phone && u.password === pass);
        if (!user) {
          throw new Error('Invalid phone or password!');
        }

        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
        setCurrentUser(user);
        setCurrentPage('dashboard');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    setCurrentUser(null);
    setCurrentPage('home');
  };

  // --- Test Logic ---
  const startTest = async (topic: string, isPro: boolean, lang: 'English' | 'Hindi') => {
    if (!currentUser) return;
    if (!isPro && currentUser.trialsUsed >= 3) {
      setError("Free trials exhausted (3/3). Please upgrade to Pro!");
      return;
    }
    if (!topic.trim()) {
      setError("Please enter an exam or subject name.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const count = isPro ? 100 : 5;
      const questions = await generateQuestions(topic, count, lang);
      setCurrentTest({ topic, questions, isPro, language: lang });
      setUserAnswers(new Array(questions.length).fill(-1));
      setActiveQuestionIndex(0);
      setTimeLeft(isPro ? 40 * 60 : 0);
      setCurrentPage('test');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const submitTest = useCallback(async () => {
    if (!currentTest || !currentUser) return;

    let correct = 0;
    currentTest.questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctAnswerIndex) correct++;
    });

    const total = currentTest.questions.length;
    const result: TestResult = {
      id: Math.random().toString(36).substr(2, 9),
      userId: currentUser.id,
      examName: currentTest.topic,
      score: correct,
      total,
      correct,
      wrong: total - correct,
      percentage: (correct / total) * 100,
      date: new Date().toISOString(),
      questions: currentTest.questions,
      userAnswers: userAnswers
    };

    const newResults = [result, ...testResults];
    setTestResults(newResults);
    localStorage.setItem(RESULTS_KEY, JSON.stringify(newResults));

    // Update trial status if free
    if (!currentTest.isPro) {
      const updatedTrials = currentUser.trialsUsed + 1;
      const updatedUser = { ...currentUser, trialsUsed: updatedTrials };
      
      // Update in users list
      const usersJson = localStorage.getItem(USERS_KEY);
      if (usersJson) {
        const users: User[] = JSON.parse(usersJson);
        const userIndex = users.findIndex(u => u.id === currentUser.id);
        if (userIndex > -1) {
          users[userIndex] = updatedUser;
          localStorage.setItem(USERS_KEY, JSON.stringify(users));
        }
      }

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
    }

    setLastResult(result);
    setCurrentPage('result');
    setCurrentTest(null);
  }, [currentTest, currentUser, userAnswers, testResults]);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (currentPage === 'test' && currentTest?.isPro && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            submitTest();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentPage, currentTest, timeLeft, submitTest]);

  // --- Payment Handler ---
  const handlePaymentSubmit = (utr: string) => {
    if (!currentUser) return;
    if (!utr.trim()) {
      alert("Please enter a valid UTR number.");
      return;
    }
    
    setIsLoading(true);
    try {
      const updatedUser = { ...currentUser, subscription: SubscriptionStatus.PENDING, utr };
      
      // Update in users list
      const usersJson = localStorage.getItem(USERS_KEY);
      if (usersJson) {
        const users: User[] = JSON.parse(usersJson);
        const userIndex = users.findIndex(u => u.id === currentUser.id);
        if (userIndex > -1) {
          users[userIndex] = updatedUser;
          localStorage.setItem(USERS_KEY, JSON.stringify(users));
        }
      }

      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      setCurrentPage('dashboard');
    } catch (err: any) {
      alert("Payment failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Admin Handlers ---
  const approvePayment = (userId: string) => {
    setIsLoading(true);
    try {
      const usersJson = localStorage.getItem(USERS_KEY);
      if (usersJson) {
        const users: User[] = JSON.parse(usersJson);
        const userIndex = users.findIndex(u => u.id === userId);
        if (userIndex > -1) {
          users[userIndex].subscription = SubscriptionStatus.PRO;
          users[userIndex].utr = undefined;
          localStorage.setItem(USERS_KEY, JSON.stringify(users));
          
          if (currentUser?.id === userId) {
            const updatedUser = { ...currentUser, subscription: SubscriptionStatus.PRO, utr: undefined };
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
            setCurrentUser(updatedUser);
          }
        }
      }
      alert("User approved successfully!");
    } catch (err: any) {
      alert("Approval failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI Components ---
  const Navbar = () => (
    <nav className="fixed top-0 left-0 right-0 z-50 glass h-16 px-6 flex items-center justify-between border-b border-white/10">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentPage('home')}>
        <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/50">T</div>
        <span className="text-xl font-bold tracking-tight">Test<span className="text-indigo-400">Trail</span></span>
      </div>
      <div className="flex items-center gap-4">
        {currentUser ? (
          <>
            {currentUser.isAdmin && (
              <button onClick={() => setCurrentPage('admin')} className="text-sm font-medium text-purple-300 hover:text-purple-200">Admin</button>
            )}
            <button onClick={() => setCurrentPage('dashboard')} className="text-sm font-medium hover:text-indigo-400">Dashboard</button>
            <button 
              onClick={() => setCurrentPage(prev => prev === 'profile' ? 'dashboard' : 'profile')} 
              className={`p-2 rounded-full transition-all ${currentPage === 'profile' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/40' : 'text-indigo-400 hover:bg-indigo-400/10'}`}
            >
              <ICONS.UserCircle />
            </button>
          </>
        ) : (
          <button 
            onClick={() => { setAuthMode('login'); setCurrentPage('auth'); }}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-indigo-500/20"
          >
            Login
          </button>
        )}
      </div>
    </nav>
  );

  const Home = () => (
    <div className="pt-24 pb-12 px-6 min-h-screen flex flex-col items-center">
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-widest animate-pulse">
          Next-Gen Exam Prep
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold leading-tight">
          Conquer Govt Exams with <span className="gradient-text">AI Power</span>
        </h1>
        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
          Generate custom mock tests for UPSC, SSC, Banking, and Railways in seconds. Real patterns, real difficulty, real results.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
          <button 
            onClick={() => {
              if (currentUser) setCurrentPage('dashboard');
              else { setAuthMode('signup'); setCurrentPage('auth'); }
            }}
            className="w-full sm:w-auto px-8 py-4 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-bold text-lg shadow-2xl shadow-indigo-500/40 transition-all flex items-center justify-center gap-2 group"
          >
            Start Free Trial <ICONS.ChevronRight />
          </button>
          <button 
             onClick={() => {
               if (currentUser) setCurrentPage('dashboard');
               else { setAuthMode('signup'); setCurrentPage('auth'); }
             }}
             className="w-full sm:w-auto px-8 py-4 glass rounded-2xl font-bold text-lg hover:bg-white/10 transition-all">
            View Pro Pricing
          </button>
        </div>

        <div className="relative mt-20 h-64 md:h-96 w-full flex justify-center items-center">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/20 rounded-full blur-[120px]"></div>
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-purple-500/20 rounded-full blur-[100px]"></div>
           <div className="relative glass-card w-full max-w-2xl h-full rounded-[2rem] p-8 flex flex-col justify-center items-center border-indigo-500/20 shadow-[0_20px_50px_rgba(8,_112,_184,_0.1)] animate-float">
              <ICONS.Brain />
              <div className="mt-6 flex flex-wrap justify-center gap-4">
                {['SSC CGL', 'UPSC History', 'Bank PO', 'Railway Reasoning'].map(tag => (
                  <span key={tag} className="px-4 py-2 glass rounded-xl text-xs font-semibold text-slate-300">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-8 grid grid-cols-3 gap-8 w-full">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">50K+</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Tests Generated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">4.9/5</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Student Rating</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">99%</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">Accuracy</div>
                </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );

  const Auth = () => {
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    
    return (
      <div className="pt-24 min-h-screen px-6 flex justify-center">
        <div className="w-full max-md space-y-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold">
              {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-slate-400 mt-2">
              {authMode === 'login' ? 'Continue your prep journey' : 'Join thousands of aspirants today'}
            </p>
          </div>
          
          <div className="glass p-8 rounded-[2rem] space-y-6">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Full Name</label>
                  <input 
                    type="text" 
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full mt-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500 transition-all"
                    placeholder="Enter your name"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Phone Number</label>
                <input 
                  type="tel" 
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full mt-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500 transition-all"
                  placeholder="9876543210"
                />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full mt-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>
            <button 
              disabled={isLoading}
              onClick={() => handleAuth(fullName, phone, password)}
              className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 rounded-xl font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            >
              {isLoading ? 'Processing...' : (authMode === 'login' ? 'Sign In' : 'Sign Up')}
            </button>

            <p className="text-center text-sm text-slate-500">
              {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}{' '}
              <button 
                onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setError(null); }}
                className="text-indigo-400 font-bold hover:underline"
              >
                {authMode === 'login' ? 'Sign Up' : 'Log In'}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  };

  const Dashboard = () => {
    const [topic, setTopic] = useState('');

    return (
      <div className="pt-24 pb-12 px-6 max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold">Namaste, {currentUser?.fullName}!</h2>
            <p className="text-slate-400">Ready for today's prep challenge?</p>
          </div>
          <div className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest ${
            currentUser?.subscription === SubscriptionStatus.PRO ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
            currentUser?.subscription === SubscriptionStatus.PENDING ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
            'bg-slate-500/20 text-slate-400 border border-slate-500/30'
          }`}>
            {currentUser?.subscription === SubscriptionStatus.PRO ? 'Pro Plan Active' : 
             currentUser?.subscription === SubscriptionStatus.PENDING ? 'Verification Pending' : 
             'Free Plan'}
          </div>
        </div>

        {currentUser?.subscription === SubscriptionStatus.FREE && (
           <div className="glass p-6 rounded-[1.5rem] bg-indigo-900/10 border-indigo-500/20 flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="space-y-1">
                <h3 className="text-xl font-bold flex items-center gap-2">Upgrade to Pro <span className="text-xs py-0.5 px-2 bg-indigo-500 rounded text-white font-black italic">HOT</span></h3>
                <p className="text-slate-400 text-sm">Unlock unlimited 100-question tests with timer for just ₹100/mo.</p>
              </div>
              <button 
                onClick={() => setCurrentPage('payment')}
                className="w-full md:w-auto px-6 py-3 bg-indigo-500 hover:bg-indigo-600 rounded-xl font-bold shadow-lg shadow-indigo-500/20 whitespace-nowrap"
              >
                Go Pro Now
              </button>
           </div>
        )}

        <div className="glass p-8 rounded-[2rem] space-y-6">
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">New Mock Test</h3>
            <p className="text-slate-400">What are we studying today? Enter exam name or subject.</p>
          </div>
          {error && <p className="text-red-400 text-sm px-2">{error}</p>}
          
          <div className="space-y-4">
            <div className="relative">
              <input 
                type="text"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                placeholder="e.g. SSC CGL Quant, Modern History, Static GK..."
                className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500 text-lg transition-all"
              />
            </div>

            <div className="flex items-center gap-4 px-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Select Language:</span>
              <div className="flex glass p-1 rounded-xl">
                <button 
                  onClick={() => setTestLanguage('English')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${testLanguage === 'English' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  English
                </button>
                <button 
                  onClick={() => setTestLanguage('Hindi')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${testLanguage === 'Hindi' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Hindi
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              disabled={isLoading}
              onClick={() => startTest(topic, false, testLanguage)}
              className="flex-1 py-4 glass hover:bg-white/10 rounded-2xl font-bold text-slate-300 disabled:opacity-50"
            >
              {isLoading ? 'Generating...' : `Start 5-Q Free Trial (${testLanguage})`}
            </button>
            <button 
              disabled={isLoading || currentUser?.subscription !== SubscriptionStatus.PRO}
              onClick={() => startTest(topic, true, testLanguage)}
              className="flex-1 py-4 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-bold shadow-xl shadow-indigo-500/30 disabled:opacity-50 disabled:bg-slate-700"
            >
              {currentUser?.subscription === SubscriptionStatus.PRO ? (isLoading ? 'Generating...' : `Start Full 100-Q Test (${testLanguage})`) : 'Full Test (Pro Only)'}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <ICONS.Chart /> Recent Performance
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {testResults.length === 0 ? (
              <div className="col-span-full glass p-12 text-center rounded-[1.5rem] text-slate-500">
                No tests taken yet. Start your first prep today!
              </div>
            ) : (
              testResults.map(res => (
                <div key={res.id} className="glass-card p-6 rounded-[1.5rem] flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="font-bold">{res.examName}</h4>
                    <p className="text-xs text-slate-500">{new Date(res.date).toLocaleDateString()} • {res.total} Questions</p>
                  </div>
                  <div className="text-right">
                    <div className={`text-2xl font-black ${res.percentage >= 70 ? 'text-green-400' : res.percentage >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {res.percentage.toFixed(0)}%
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-tighter">Accuracy</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const Payment = () => {
    const [utr, setUtr] = useState('');
    const upiUri = `upi://pay?pa=${appConfig.upiId}&pn=TestTrail&am=${appConfig.subscriptionPrice}&cu=INR&tn=TestTrail%20Pro%20Subscription`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUri)}`;

    return (
      <div className="pt-24 pb-12 px-6 flex justify-center">
        <div className="w-full max-w-xl space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-4xl font-black">Upgrade to <span className="gradient-text">Pro</span></h2>
            <p className="text-slate-400">Unlock unlimited AI generation and compete at elite levels.</p>
          </div>
          <div className="glass p-8 rounded-[2.5rem] space-y-8 text-center">
            <div className="space-y-4">
              <div className="relative w-64 h-64 bg-white mx-auto rounded-3xl flex items-center justify-center p-4 shadow-[0_0_40px_rgba(99,102,241,0.2)]">
                <img src={qrUrl} alt="UPI Payment QR" className="w-full h-full object-contain" />
              </div>

              <div className="pt-4">
                <a href={upiUri} className="inline-flex items-center justify-center gap-2 w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 rounded-2xl font-black shadow-xl shadow-indigo-500/20 transition-all active:scale-[0.98]">
                  Pay via UPI App <ICONS.ChevronRight />
                </a>
              </div>

              <div className="pt-2 space-y-1">
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Amount to be Paid</p>
                <div className="text-5xl font-black text-white">₹{appConfig.subscriptionPrice}</div>
              </div>
            </div>

            <div className="space-y-4 text-left border-t border-white/5 pt-8">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 ml-1">After Payment, Enter UTR / Transaction ID</label>
                <input 
                  type="text" 
                  value={utr}
                  onChange={e => setUtr(e.target.value)}
                  className="w-full px-4 py-4 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:border-indigo-500 transition-all text-center tracking-widest font-mono text-lg"
                  placeholder="Enter 12-digit UTR Number"
                />
              </div>
              <button 
                onClick={() => handlePaymentSubmit(utr)}
                className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-bold shadow-xl shadow-indigo-500/30 transition-all active:scale-[0.98]"
              >
                Submit for Verification
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ProfilePage = () => {
    if (!currentUser) return null;
    return (
      <div className="pt-24 pb-12 px-6 flex flex-col items-center max-w-2xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 bg-indigo-500/20 rounded-full mx-auto flex items-center justify-center text-indigo-400">
            <ICONS.UserCircle />
          </div>
          <h2 className="text-4xl font-black">{currentUser.fullName}</h2>
          <p className="text-slate-400">Manage your profile and subscription</p>
        </div>

        <div className="w-full glass p-8 rounded-[2.5rem] space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center py-4 border-b border-white/5">
              <span className="text-slate-500 text-sm font-bold uppercase tracking-widest">Phone Number</span>
              <span className="font-bold">{currentUser.phone}</span>
            </div>
            <div className="flex justify-between items-center py-4 border-b border-white/5">
              <span className="text-slate-500 text-sm font-bold uppercase tracking-widest">Subscription</span>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                currentUser.subscription === SubscriptionStatus.PRO ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                currentUser.subscription === SubscriptionStatus.PENDING ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                'bg-slate-500/20 text-slate-400 border border-slate-500/30'
              }`}>
                {currentUser.subscription} Status
              </span>
            </div>
            <div className="flex justify-between items-center py-4 border-b border-white/5">
              <span className="text-slate-500 text-sm font-bold uppercase tracking-widest">Free Trials Used</span>
              <span className="font-bold">{currentUser.trialsUsed}/3</span>
            </div>
          </div>

          <div className="pt-8">
            <button 
              onClick={handleLogout}
              className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border border-red-500/20"
            >
              <ICONS.Power /> Logout
            </button>
          </div>
        </div>
      </div>
    );
  };

  const AdminPanel = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [upi, setUpi] = useState(appConfig.upiId);

    useEffect(() => {
      const fetchAllUsers = () => {
        const usersJson = localStorage.getItem(USERS_KEY);
        if (usersJson) setUsers(JSON.parse(usersJson));
      };
      fetchAllUsers();
    }, []);

    const updateConfig = () => {
      const newConfig = { ...appConfig, upiId: upi };
      setAppConfig(newConfig);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(newConfig));
      alert("Config Updated!");
    };

    return (
      <div className="pt-24 pb-12 px-6 max-w-5xl mx-auto space-y-12">
        <h2 className="text-4xl font-black">Admin <span className="text-purple-400">Control Center</span></h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-6">
            <div className="glass p-6 rounded-[2rem] space-y-4">
              <h3 className="font-bold text-lg">Platform Settings</h3>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase">Backend UPI ID</label>
                <input 
                  type="text" 
                  value={upi}
                  onChange={e => setUpi(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl"
                  placeholder="e.g. yourname@upi"
                />
              </div>
              <button onClick={updateConfig} className="w-full py-3 bg-purple-500 rounded-xl font-bold">Save Settings</button>
            </div>
          </div>

          <div className="md:col-span-2 glass p-8 rounded-[2rem] space-y-6">
            <h3 className="font-bold text-xl">Manage Users & Payments</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/10 text-slate-500 text-xs font-black uppercase tracking-widest">
                    <th className="pb-4">Phone</th>
                    <th className="pb-4">Status</th>
                    <th className="pb-4">UTR</th>
                    <th className="pb-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map(user => (
                    <tr key={user.id}>
                      <td className="py-4 font-bold">{user.phone}</td>
                      <td className="py-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${
                          user.subscription === SubscriptionStatus.PRO ? 'bg-green-500/20 text-green-400' :
                          user.subscription === SubscriptionStatus.PENDING ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>
                          {user.subscription}
                        </span>
                      </td>
                      <td className="py-4 text-xs font-mono">{user.utr || '-'}</td>
                      <td className="py-4">
                        {user.subscription === SubscriptionStatus.PENDING && (
                          <button onClick={() => approvePayment(user.id)} className="px-3 py-1 bg-indigo-500 text-xs font-bold rounded-lg hover:bg-indigo-600 transition-colors">Approve</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TestInterface = () => {
    if (!currentTest) return null;
    const q = currentTest.questions[activeQuestionIndex];
    const selected = userAnswers[activeQuestionIndex];
    const hasSelected = selected !== -1;

    const formatTime = (s: number) => {
      const mins = Math.floor(s / 60);
      const secs = s % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
      <div className="pt-24 pb-12 px-6 min-h-screen flex flex-col max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8 glass p-4 rounded-2xl">
          <div className="space-y-0.5">
            <h3 className="font-bold text-slate-400 text-xs uppercase tracking-widest">Mock Test ({currentTest.language})</h3>
            <div className="font-bold text-lg truncate max-w-[150px] md:max-w-none">{currentTest.topic}</div>
          </div>
          {currentTest.isPro && (
            <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 text-indigo-400 rounded-xl font-bold">
              <ICONS.Timer />
              <span className="text-xl tabular-nums">{formatTime(timeLeft)}</span>
            </div>
          )}
          <div className="text-right">
             <div className="text-slate-400 text-xs font-bold uppercase tracking-widest">Progress</div>
             <div className="text-xl font-bold">{activeQuestionIndex + 1}/{currentTest.questions.length}</div>
          </div>
        </div>

        <div className="flex-1 glass p-8 rounded-[2rem] space-y-8 shadow-[0_0_50px_rgba(99,102,241,0.1)]">
          <div className="space-y-4">
            <div className="text-xs font-black text-indigo-400 uppercase tracking-widest">Question {activeQuestionIndex + 1}</div>
            <h2 className="text-xl md:text-2xl font-bold leading-relaxed">{q.text}</h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {q.options.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => {
                  const newAns = [...userAnswers];
                  newAns[activeQuestionIndex] = idx;
                  setUserAnswers(newAns);
                }}
                className={`w-full p-5 text-left rounded-2xl border transition-all flex items-center justify-between group ${
                  selected === idx 
                    ? 'bg-indigo-500/20 border-indigo-500 text-white' 
                    : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/30 hover:bg-white/[0.07]'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold border ${
                    selected === idx ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-white/5 border-white/10'
                  }`}>{String.fromCharCode(65 + idx)}</div>
                  <span className="font-medium">{opt}</span>
                </div>
                {selected === idx && <ICONS.Check />}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex gap-4">
          <button disabled={activeQuestionIndex === 0} onClick={() => setActiveQuestionIndex(prev => prev - 1)} className="px-6 py-4 glass rounded-2xl font-bold hover:bg-white/10 disabled:opacity-30 flex items-center gap-2">
            <ICONS.ChevronLeft /> Previous
          </button>
          {activeQuestionIndex < currentTest.questions.length - 1 ? (
            <button disabled={!hasSelected} onClick={() => setActiveQuestionIndex(prev => prev + 1)} className={`flex-1 py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all ${hasSelected ? 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
              Next <ICONS.ChevronRight />
            </button>
          ) : (
            <button disabled={!hasSelected} onClick={submitTest} className={`flex-1 py-4 rounded-2xl font-bold shadow-lg transition-all ${hasSelected ? 'bg-green-500 hover:bg-green-600 shadow-green-500/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
              Finish & See Results
            </button>
          )}
        </div>
      </div>
    );
  };

  const ResultPage = () => {
    if (!lastResult) return null;
    const [reviewMode, setReviewMode] = useState(false);

    if (reviewMode) {
      return (
        <div className="pt-24 pb-12 px-6 max-w-4xl mx-auto space-y-8">
           <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold">Answer Review</h2>
              <button onClick={() => setReviewMode(false)} className="px-4 py-2 glass rounded-xl font-bold">Back to Result</button>
           </div>
           <div className="space-y-6">
              {lastResult.questions.map((q, qIdx) => {
                const userAns = lastResult.userAnswers[qIdx];
                const isCorrect = userAns === q.correctAnswerIndex;
                return (
                  <div key={q.id} className={`glass p-6 rounded-2xl border-l-4 ${isCorrect ? 'border-l-green-500' : 'border-l-red-500'}`}>
                    <p className="font-bold text-lg mb-4">{q.text}</p>
                    <div className="grid grid-cols-1 gap-2">
                       {q.options.map((opt, oIdx) => (
                         <div key={oIdx} className={`p-3 rounded-xl border flex items-center gap-3 ${oIdx === q.correctAnswerIndex ? 'bg-green-500/10 border-green-500/30 text-green-400' : oIdx === userAns ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-white/5 border-white/5 text-slate-500'}`}>
                           <span className="font-bold">{String.fromCharCode(65 + oIdx)}.</span>
                           <span>{opt}</span>
                         </div>
                       ))}
                    </div>
                  </div>
                )
              })}
           </div>
        </div>
      )
    }

    return (
      <div className="pt-24 pb-12 px-6 flex flex-col items-center max-w-3xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-yellow-500/20 rounded-full mx-auto flex items-center justify-center text-yellow-500 animate-bounce">
            <ICONS.Trophy />
          </div>
          <h2 className="text-4xl font-black">Test Completed!</h2>
          <p className="text-slate-400">Great effort! Performance breakdown for <span className="text-white font-bold">{lastResult.examName}</span></p>
        </div>
        <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-4">
           {[
             { label: 'Score', value: `${lastResult.score}/${lastResult.total}`, color: 'text-indigo-400' },
             { label: 'Correct', value: lastResult.correct, color: 'text-green-400' },
             { label: 'Wrong', value: lastResult.wrong, color: 'text-red-400' },
             { label: 'Percentage', value: `${lastResult.percentage.toFixed(0)}%`, color: 'text-purple-400' },
           ].map((stat, i) => (
             <div key={i} className="glass-card p-6 rounded-[2rem] text-center space-y-1">
               <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{stat.label}</div>
               <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
             </div>
           ))}
        </div>
        <div className="w-full glass p-8 rounded-[2rem] space-y-6">
          <div className="flex flex-col gap-4">
            <button onClick={() => setReviewMode(true)} className="w-full py-4 glass hover:bg-white/10 rounded-2xl font-bold">Review Answers</button>
            <button onClick={() => setCurrentPage('dashboard')} className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-bold shadow-xl shadow-indigo-500/30">Back to Dashboard</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Navbar />
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
      <main>
        {currentPage === 'home' && <Home />}
        {currentPage === 'auth' && <Auth />}
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'payment' && <Payment />}
        {currentPage === 'test' && <TestInterface />}
        {currentPage === 'result' && <ResultPage />}
        {currentPage === 'admin' && <AdminPanel />}
        {currentPage === 'profile' && <ProfilePage />}
      </main>
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
          <div className="text-center">
            <p className="font-bold text-lg">Starting your test...</p>
          </div>
        </div>
      )}
      <footer className="py-12 px-6 border-t border-white/5 text-center text-slate-500 text-sm">
         <p>© 2024 TestTrail. All rights reserved.</p>
         <p className="mt-1">Handcrafted for future civil servants of India.</p>
      </footer>
    </div>
  );
};

export default App;
