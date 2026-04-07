
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Brain, 
  BarChart3, 
  Timer, 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  LogOut, 
  UserCircle,
  Settings,
  Trash2,
  ShieldCheck,
  Zap,
  Languages,
  ArrowRight,
  CreditCard,
  History,
  AlertCircle,
  Loader2,
  Menu,
  X,
  Mail,
  Search,
  FileText,
  Target,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  User, 
  SubscriptionStatus, 
  Question, 
  TestResult, 
  AppConfig 
} from './types';
import { generateQuestions } from './services/geminiService';
import { supabase } from './supabase';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Please wait...');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [testLanguage, setTestLanguage] = useState<'English' | 'Hindi'>('English');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'confirm' | 'alert';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'alert'
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModal({ isOpen: true, title, message, onConfirm, type: 'confirm' });
  };

  const showAlert = (title: string, message: string) => {
    setModal({ isOpen: true, title, message, onConfirm: () => setModal(prev => ({ ...prev, isOpen: false })), type: 'alert' });
  };

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
    const initApp = async () => {
      setLoadingMessage('Loading App...');
      setIsLoading(true);
      
      // Check if Supabase is configured
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      if (!supabaseUrl || supabaseUrl === 'https://placeholder-url.supabase.co') {
        setError('Supabase is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment variables and redeploy.');
        setIsLoading(false);
        return;
      }

      try {
        // 1. Load Config
        const { data: configData, error: configError } = await supabase
          .from('config')
          .select('*')
          .single();
        
        if (configData) {
          setAppConfig({
            upiId: configData.upi_id,
            subscriptionPrice: configData.subscription_price
          });
        } else if (configError && configError.code === 'PGRST116') {
          // No config found, create default
          await supabase.from('config').insert([{
            upi_id: DEFAULT_CONFIG.upiId,
            subscription_price: DEFAULT_CONFIG.subscriptionPrice
          }]);
        }

        // 2. Load Users
        const { data: usersData } = await supabase
          .from('users')
          .select('*');
        
        if (usersData) {
          const formattedUsers: User[] = usersData.map(u => ({
            id: u.id,
            fullName: u.full_name,
            email: u.email || u.phone, // Fallback for transition
            password: u.password,
            subscription: u.subscription as SubscriptionStatus,
            trialsUsed: u.trials_used,
            isAdmin: u.is_admin,
            utr: u.utr
          }));
          setUsers(formattedUsers);
        }

        // 3. Load Current User from LocalStorage (Session)
        const savedUser = localStorage.getItem(CURRENT_USER_KEY);
        if (savedUser) {
          const parsedUser = JSON.parse(savedUser);
          // Verify user still exists and get latest data
          const { data: latestUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', parsedUser.id)
            .single();
          
          if (latestUser) {
            const formattedUser: User = {
              id: latestUser.id,
              fullName: latestUser.full_name,
              email: latestUser.email || latestUser.phone,
              password: latestUser.password,
              subscription: latestUser.subscription as SubscriptionStatus,
              trialsUsed: latestUser.trials_used,
              isAdmin: latestUser.is_admin,
              utr: latestUser.utr
            };
            setCurrentUser(formattedUser);
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(formattedUser));

            // Load results for this user
            const { data: resultsData } = await supabase
              .from('results')
              .select('*')
              .eq('user_id', formattedUser.id)
              .order('date', { ascending: false });
            
            if (resultsData) {
              setTestResults(resultsData.map(r => ({
                id: r.id,
                userId: r.user_id,
                examName: r.exam_name,
                score: r.score,
                total: r.total,
                correct: r.correct,
                wrong: r.wrong,
                percentage: r.percentage,
                date: r.date,
                questions: JSON.parse(r.questions),
                userAnswers: JSON.parse(r.user_answers)
              })));
            }
          } else {
            localStorage.removeItem(CURRENT_USER_KEY);
          }
        }
      } catch (err) {
        console.error('Error initializing app:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initApp();

    // 4. Handle Auth State Changes & Email Confirmation Redirects
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Check if this was a signup confirmation
        const hash = window.location.hash;
        if (hash.includes('type=signup') || hash.includes('type=recovery')) {
          // If it was a signup confirmation, we might want to show login or just go to dashboard
          // The user specifically asked for login page
          setCurrentPage('auth');
          setAuthMode('login');
          setSuccessMessage(hash.includes('type=signup') ? 'Email confirmed! Please login to continue.' : 'Password reset link verified! Please set your new password.');
          // Clear hash to prevent re-triggering
          window.history.replaceState(null, '', window.location.pathname);
          return;
        }

        // Normal sign in
        const { data: latestUser } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single();
        
        if (latestUser) {
          const formattedUser: User = {
            id: latestUser.id,
            fullName: latestUser.full_name,
            email: latestUser.email || latestUser.phone,
            password: latestUser.password,
            subscription: latestUser.subscription as SubscriptionStatus,
            trialsUsed: latestUser.trials_used,
            isAdmin: latestUser.is_admin,
            utr: latestUser.utr
          };
          setCurrentUser(formattedUser);
          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(formattedUser));
          setCurrentPage('dashboard');
        }
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        localStorage.removeItem(CURRENT_USER_KEY);
        setCurrentPage('home');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // --- Local Auth Handlers ---
  const handleAuth = async (fullName: string, email: string, pass: string, confirmPass?: string) => {
    setError(null);
    setSuccessMessage(null);
    setLoadingMessage(authMode === 'login' ? 'Logging in...' : 'Creating Account...');
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    try {
      if (authMode === 'signup') {
        if (!fullName.trim() || !cleanEmail || !cleanPass || !confirmPass) {
          throw new Error('All fields are required!');
        }

        if (cleanPass !== confirmPass.trim()) {
          throw new Error('Passwords do not match! Please check your password again.');
        }

        if (!cleanEmail.includes('@')) {
          throw new Error('Please enter a valid email address!');
        }

        // 1. Sign up with Supabase Auth (This sends the email)
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPass,
          options: {
            data: {
              full_name: fullName.trim(),
            }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          const isAdmin = cleanEmail === 'lallusinghnetam0@gmail.com' || cleanEmail === '8839191411@gmail.com' || cleanEmail === 'testtrail@gmail.com';
          
          // 2. Insert into our public.users table for metadata
          const { error: insertError } = await supabase
            .from('users')
            .insert([{
              id: authData.user.id,
              full_name: fullName.trim(),
              email: cleanEmail,
              password: cleanPass, // Keeping for admin view as requested before
              subscription: isAdmin ? SubscriptionStatus.PRO : SubscriptionStatus.FREE,
              trials_used: 0,
              is_admin: isAdmin
            }]);

          if (insertError) {
            console.error('Metadata insert error:', insertError);
          }

          showAlert("Success", "Confirmation link sent! Please check your email and click the link to verify your account.");
          setAuthMode('login');
        }
      } else {
        // Special case for master admin login (Bypassing Supabase Auth for master keys if needed, but better to use real auth)
        if ((cleanEmail === 'lallusinghnetam0@gmail.com' && cleanPass === 'Lallu7888') || (cleanEmail === 'testtrail@gmail.com' && cleanPass === 'Netam7888')) {
          // Master login logic remains same but uses Supabase Auth if possible
        }

        // Real Login with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPass,
        });

        if (authError) {
          // If master admin, we might have a different password in the table than Supabase Auth
          // So we fallback to table check if needed, but let's try to keep it consistent
          throw new Error(authError.message);
        }

        if (authData.user) {
          const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('id', authData.user.id)
            .maybeSingle();

          if (!userData) {
            throw new Error('User data not found in database.');
          }

          const isAdmin = cleanEmail === 'lallusinghnetam0@gmail.com' || cleanEmail === '8839191411@gmail.com' || cleanEmail === 'testtrail@gmail.com';
          const updatedUser: User = {
            id: userData.id,
            fullName: userData.full_name,
            email: userData.email,
            password: userData.password,
            subscription: userData.subscription as SubscriptionStatus,
            trialsUsed: userData.trials_used,
            isAdmin: isAdmin,
            utr: userData.utr
          };

          localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
          setCurrentUser(updatedUser);
          
          // Load results
          const { data: resultsData } = await supabase
            .from('results')
            .select('*')
            .eq('user_id', updatedUser.id)
            .order('date', { ascending: false });
          
          if (resultsData) {
            setTestResults(resultsData.map(r => ({
              id: r.id,
              userId: r.user_id,
              examName: r.exam_name,
              score: r.score,
              total: r.total,
              correct: r.correct,
              wrong: r.wrong,
              percentage: r.percentage,
              date: r.date,
              questions: JSON.parse(r.questions),
              userAnswers: JSON.parse(r.user_answers)
            })));
          }

          setCurrentPage(isAdmin ? 'admin' : 'dashboard');
        }
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      setError(err.message || 'Authentication failed. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (email: string, newPass: string, confirmPass: string) => {
    setError(null);
    setSuccessMessage(null);
    setLoadingMessage('Resetting Password...');
    setIsLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = newPass.trim();

    try {
      if (!cleanEmail || !cleanPass || !confirmPass) {
        throw new Error('All fields are required!');
      }
      if (cleanPass !== confirmPass.trim()) {
        throw new Error('Passwords do not match!');
      }
      
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!user) {
        throw new Error('No account found with this email!');
      }

      const { error: updateError } = await supabase
        .from('users')
        .update({ password: cleanPass })
        .eq('id', user.id);

      if (updateError) throw updateError;

      showAlert("Success", "Password reset successfully! You can now login.");
      setAuthMode('login');
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

    // Restriction Logic
    if (isPro) {
      if (currentUser.subscription === SubscriptionStatus.PENDING) {
        showAlert("Verification Pending", "Your payment is currently being verified by our team. Please wait for approval to access full 100-question tests.");
        return;
      }
      if (currentUser.subscription === SubscriptionStatus.FREE && currentUser.trialsUsed >= 1) {
        showAlert("Trial Limit Reached", "You have used your 1 free 100-question trial. Please upgrade to Pro for unlimited access.");
        setCurrentPage('payment');
        return;
      }
    } else {
      // For 5-Q Quick Test, we can allow it but maybe count it? 
      // Currently it's free and unlimited in the code, but let's keep it that way unless asked.
    }

    if (!topic.trim()) {
      setError("Please enter an exam or subject name.");
      return;
    }

    setLoadingMessage('Starting your test...');
    setIsLoading(true);
    setError(null);
    try {
      const count = isPro ? 100 : 5;
      const questions = await generateQuestions(topic, count, lang);
      setCurrentTest({ topic, questions, isPro, language: lang });
      setUserAnswers(new Array(questions.length).fill(-1));
      setActiveQuestionIndex(0);
      setTimeLeft(isPro ? 50 * 60 : 0);
      setCurrentPage('test');
    } catch (err: any) {
      console.error('Test Generation Error:', err);
      setError(err.message || 'Failed to generate test. Please try again.');
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

    try {
      // Save result to Supabase
      await supabase.from('results').insert([{
        id: result.id,
        user_id: result.userId,
        exam_name: result.examName,
        score: result.score,
        total: result.total,
        correct: result.correct,
        wrong: result.wrong,
        percentage: result.percentage,
        date: result.date,
        questions: JSON.stringify(result.questions),
        user_answers: JSON.stringify(result.userAnswers)
      }]);

      const newResults = [result, ...testResults];
      setTestResults(newResults);

      // Update trial status if free
      if (currentUser.subscription === SubscriptionStatus.FREE) {
        const updatedTrials = currentUser.trialsUsed + 1;
        const updatedUser = { ...currentUser, trialsUsed: updatedTrials };
        
        await supabase
          .from('users')
          .update({ trials_used: updatedTrials })
          .eq('id', currentUser.id);

        setUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
        setCurrentUser(updatedUser);
      }

      setLastResult(result);
      setCurrentPage('result');
      setCurrentTest(null);
    } catch (err) {
      console.error('Error saving test result:', err);
      showAlert('Error', 'Failed to save test result. Please check your connection.');
    }
  }, [currentTest, currentUser, userAnswers, testResults, users]);

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
  const handlePaymentSubmit = async (utr: string) => {
    if (!currentUser) return;
    const cleanUtr = utr.trim();
    
    if (!cleanUtr || cleanUtr.length !== 12) {
      showAlert("Invalid UTR", "Please enter a valid 12-digit UTR number.");
      return;
    }

    // Check for duplicate UTR across all users
    const { data: duplicateUtr } = await supabase
      .from('users')
      .select('id')
      .eq('utr', cleanUtr)
      .neq('id', currentUser.id)
      .maybeSingle();

    if (duplicateUtr) {
      showAlert("Duplicate UTR", "This UTR has already been submitted by another user. Please check and try again.");
      return;
    }
    
    setIsLoading(true);
    try {
      const updatedUser = { ...currentUser, subscription: SubscriptionStatus.PENDING, utr: cleanUtr };
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ subscription: SubscriptionStatus.PENDING, utr: cleanUtr })
        .eq('id', currentUser.id);

      if (updateError) throw updateError;

      setUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
      setCurrentPage('dashboard');
    } catch (err: any) {
      showAlert("Payment Error", "Payment failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Admin Handlers ---
  const approvePayment = async (userId: string) => {
    setIsLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ subscription: SubscriptionStatus.PRO, utr: null })
        .eq('id', userId);

      if (updateError) throw updateError;

      const newUsers = users.map(u => {
        if (u.id === userId) {
          return { ...u, subscription: SubscriptionStatus.PRO, utr: undefined };
        }
        return u;
      });
      setUsers(newUsers);
      
      if (currentUser?.id === userId) {
        const updatedUser = { ...currentUser, subscription: SubscriptionStatus.PRO, utr: undefined };
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
        setCurrentUser(updatedUser);
      }
      showAlert("Success", "User approved successfully!");
    } catch (err: any) {
      showAlert("Error", "Approval failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // --- UI Components ---
  const Navbar = () => (
    <nav className="fixed top-0 left-0 right-0 z-50 glass h-20 px-6 flex items-center justify-between border-b border-white/10">
      <div 
        className="flex items-center gap-3 cursor-pointer group" 
        onClick={() => setCurrentPage('home')}
      >
        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center font-black text-white shadow-xl shadow-indigo-500/20 group-hover:scale-110 transition-transform">
          T
        </div>
        <span className="text-2xl font-black tracking-tighter">
          Test<span className="gradient-text">Trail</span>
        </span>
      </div>

      <div className="hidden md:flex items-center gap-8">
        {currentUser ? (
          <>
            {!currentUser.isAdmin && (
              <button 
                onClick={() => setCurrentPage('dashboard')} 
                className={cn(
                  "text-sm font-bold uppercase tracking-widest transition-colors",
                  currentPage === 'dashboard' ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
                )}
              >
                Dashboard
              </button>
            )}
            {currentUser.isAdmin && (
              <button 
                onClick={() => setCurrentPage('admin')} 
                className={cn(
                  "text-sm font-bold uppercase tracking-widest transition-colors",
                  currentPage === 'admin' ? "text-purple-400" : "text-slate-400 hover:text-slate-200"
                )}
              >
                Admin Panel
              </button>
            )}
            {!currentUser.isAdmin && (
              <button 
                onClick={() => currentPage === 'profile' ? setCurrentPage('home') : setCurrentPage('profile')} 
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl transition-all border",
                  currentPage === 'profile' 
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" 
                    : "border-transparent text-slate-400 hover:bg-white/5"
                )}
              >
                <UserCircle size={20} />
                <span className="text-sm font-bold">{currentUser.fullName.split(' ')[0]}</span>
              </button>
            )}
            {currentUser.isAdmin && (
              <button 
                onClick={handleLogout}
                className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              >
                Logout
              </button>
            )}
          </>
        ) : (
          <button 
            onClick={() => { setAuthMode('login'); setCurrentPage('auth'); }}
            className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/20 active:scale-95"
          >
            Login
          </button>
        )}
      </div>

      <div className="md:hidden flex items-center gap-2">
        {!currentUser && (
          <button 
            onClick={() => { setAuthMode('login'); setCurrentPage('auth'); }}
            className="px-4 py-2 bg-indigo-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
          >
            Login
          </button>
        )}
        
        <button 
          onClick={() => {
            if (currentUser) {
              if (currentPage === 'profile') {
                setCurrentPage('home');
              } else {
                setCurrentPage('profile');
              }
              setIsMobileMenuOpen(false);
            } else {
              setIsMobileMenuOpen(!isMobileMenuOpen);
            }
          }}
          className="transition-all active:scale-90"
        >
          {isMobileMenuOpen ? (
            <div className="p-2 text-slate-400"><X /></div>
          ) : (
            currentUser ? (
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                <UserCircle size={24} />
              </div>
            ) : (
              <div className="p-2 text-slate-400"><Menu /></div>
            )
          )}
        </button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-0 right-0 glass border-b border-white/10 p-6 flex flex-col gap-4 md:hidden"
          >
            {currentUser ? (
              <>
                {!currentUser.isAdmin && <button onClick={() => { setCurrentPage('dashboard'); setIsMobileMenuOpen(false); }} className="text-left font-bold py-2">Dashboard</button>}
                {currentUser.isAdmin && <button onClick={() => { setCurrentPage('admin'); setIsMobileMenuOpen(false); }} className="text-left font-bold py-2 text-purple-400">Admin Panel</button>}
                {!currentUser.isAdmin && <button onClick={() => { setCurrentPage('profile'); setIsMobileMenuOpen(false); }} className="text-left font-bold py-2">Profile</button>}
                <button onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }} className="text-left font-bold py-2 text-red-400">Logout</button>
              </>
            ) : (
              <button onClick={() => { setAuthMode('login'); setCurrentPage('auth'); setIsMobileMenuOpen(false); }} className="w-full py-4 bg-indigo-500 rounded-2xl font-bold">Login / Signup</button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );

  const Home = () => (
    <div className="pt-32 pb-20 px-6 min-h-screen flex flex-col items-center overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-5xl w-full text-center space-y-10 relative"
      >
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] animate-pulse">
          <Zap size={12} /> Next-Gen Exam Prep
        </div>
        
        <h1 className="text-6xl md:text-8xl font-black leading-[0.9] tracking-tighter">
          Conquer Govt Exams <br />
          <span className="gradient-text">with AI Power</span>
        </h1>
        
        <p className="text-slate-400 text-lg md:text-2xl max-w-3xl mx-auto leading-relaxed font-medium">
          Generate custom mock tests for UPSC, SSC, Banking, and Railways in seconds. 
          Real patterns, real difficulty, real results.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-5 justify-center items-center pt-6">
          <button 
            onClick={() => {
              if (currentUser) setCurrentPage(currentUser.isAdmin ? 'admin' : 'dashboard');
              else { setAuthMode('signup'); setCurrentPage('auth'); }
            }}
            className="w-full sm:w-auto px-10 py-5 bg-indigo-500 hover:bg-indigo-600 rounded-[2rem] font-black text-lg shadow-2xl shadow-indigo-500/40 transition-all flex items-center justify-center gap-3 group active:scale-95"
          >
            Start Mock Test <ChevronRight className="group-hover:translate-x-1 transition-transform" />
          </button>
          <button 
             onClick={() => {
               if (currentUser) setCurrentPage(currentUser.isAdmin ? 'admin' : 'dashboard');
               else { setAuthMode('signup'); setCurrentPage('auth'); }
             }}
             className="w-full sm:w-auto px-10 py-5 glass rounded-[2rem] font-black text-lg hover:bg-white/10 transition-all border border-white/10 active:scale-95">
            View Pro Pricing
          </button>
        </div>

        <div className="relative mt-32 w-full max-w-4xl mx-auto">
           <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[120%] h-[120%] bg-indigo-500/10 rounded-full blur-[120px] -z-10"></div>
           <motion.div 
             initial={{ opacity: 0, scale: 0.9 }}
             animate={{ opacity: 1, scale: 1 }}
             transition={{ delay: 0.4, duration: 1 }}
             className="relative glass p-1 rounded-[3rem] border-white/10 shadow-[0_40px_100px_rgba(0,0,0,0.5)]"
           >
              <div className="bg-slate-900/50 rounded-[2.8rem] p-10 md:p-16 flex flex-col justify-center items-center space-y-12 overflow-hidden">
                 <div className="p-5 bg-indigo-500/10 rounded-3xl text-indigo-400 border border-indigo-500/20 animate-float">
                    <Brain size={64} strokeWidth={1.5} />
                 </div>
                 
                 <div className="flex flex-wrap justify-center gap-3">
                   {['SSC CGL', 'UPSC History', 'Bank PO', 'Railway Reasoning', 'Static GK'].map((tag, i) => (
                     <motion.span 
                       initial={{ opacity: 0, x: -20 }}
                       animate={{ opacity: 1, x: 0 }}
                       transition={{ delay: 0.6 + (i * 0.1) }}
                       key={tag} 
                       className="px-5 py-2.5 glass rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 border border-white/5"
                     >
                       {tag}
                     </motion.span>
                   ))}
                 </div>

                 <div className="grid grid-cols-3 gap-12 w-full pt-8 border-t border-white/5">
                   {[
                     { val: '50K+', label: 'Tests Generated' },
                     { val: '4.9/5', label: 'Student Rating' },
                     { val: '99%', label: 'Accuracy' }
                   ].map((stat, i) => (
                     <div key={i} className="text-center space-y-2">
                       <div className="text-3xl md:text-5xl font-black text-white tracking-tighter">{stat.val}</div>
                       <div className="text-[9px] text-slate-500 font-black uppercase tracking-[0.2em]">{stat.label}</div>
                     </div>
                   ))}
                 </div>
              </div>
           </motion.div>
        </div>
      </motion.div>
    </div>
  );

  const Auth = () => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    
    return (
      <div className="pt-32 min-h-screen px-6 flex justify-center items-start">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md space-y-10"
        >
          <div className="text-center space-y-3">
            <h2 className="text-5xl font-black tracking-tight">
              {authMode === 'login' ? 'Welcome Back' : authMode === 'signup' ? 'Create Account' : 'Reset Password'}
            </h2>
            <p className="text-slate-400 font-medium">
              {authMode === 'login' ? 'Continue your prep journey' : authMode === 'signup' ? 'Join thousands of aspirants today' : 'Enter your email to reset password'}
            </p>
          </div>
          
          <div className="glass p-10 rounded-[3rem] space-y-8 shadow-2xl shadow-indigo-500/10 border-white/10">
            {error && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold rounded-2xl flex items-center gap-3"
              >
                <AlertCircle size={16} /> {error}
              </motion.div>
            )}

            {successMessage && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="p-4 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold rounded-2xl flex items-center gap-3"
              >
                <CheckCircle2 size={16} /> {successMessage}
              </motion.div>
            )}
            
            <div className="space-y-5">
              {authMode === 'signup' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Full Name</label>
                  <input 
                    type="text" 
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full px-6 py-4 bg-white/[0.03] border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500/50 transition-all font-bold"
                    placeholder="Enter your name"
                  />
                </div>
              )}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Email Address</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-6 py-4 bg-white/[0.03] border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500/50 transition-all font-bold"
                  placeholder="Enter your email"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{authMode === 'forgot' ? 'New Password' : 'Password'}</label>
                <div className="relative">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-6 py-4 bg-white/[0.03] border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500/50 transition-all font-bold pr-14"
                    placeholder="••••••••"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              {(authMode === 'signup' || authMode === 'forgot') && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Confirm Password</label>
                  <div className="relative">
                    <input 
                      type={showConfirmPassword ? "text" : "password"} 
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full px-6 py-4 bg-white/[0.03] border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500/50 transition-all font-bold pr-14"
                      placeholder="••••••••"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {authMode === 'login' && (
              <div className="flex justify-end">
                <button 
                  onClick={() => { setAuthMode('forgot'); setError(null); }}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            <button 
              disabled={isLoading}
              onClick={() => authMode === 'forgot' ? handleResetPassword(email, password, confirmPassword) : handleAuth(fullName, email, password, confirmPassword)}
              className="w-full py-5 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-black text-lg shadow-xl shadow-indigo-500/30 transition-all flex items-center justify-center gap-3 active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="animate-spin" /> : (authMode === 'login' ? 'Login Now' : authMode === 'signup' ? 'Create Account' : 'Reset Password')}
              {!isLoading && <ArrowRight size={20} />}
            </button>

            <p className="text-center text-sm text-slate-500 font-medium">
              {authMode === 'forgot' ? (
                <button 
                  onClick={() => { setAuthMode('login'); setError(null); }}
                  className="text-indigo-400 font-black hover:underline underline-offset-4"
                >
                  Back to Login
                </button>
              ) : (
                <>
                  {authMode === 'login' ? "Don't have an account?" : "Already have an account?"}{' '}
                  <button 
                    onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setError(null); }}
                    className="text-indigo-400 font-black hover:underline underline-offset-4"
                  >
                    {authMode === 'login' ? 'Sign Up' : 'Log In'}
                  </button>
                </>
              )}
            </p>
          </div>
        </motion.div>
      </div>
    );
  };

  const Dashboard = () => {
    const [topic, setTopic] = useState('');
    const [testLanguage, setTestLanguage] = useState<'English' | 'Hindi'>('English');
    
    return (
      <div className="pt-32 pb-20 px-6 max-w-5xl mx-auto space-y-12">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
        >
          <div className="space-y-1">
            <h2 className="text-4xl font-black tracking-tight">Hello, {currentUser?.fullName.split(' ')[0]}!</h2>
            <p className="text-slate-400 font-medium italic">Ready for today's prep challenge?</p>
          </div>
          <div className={cn(
            "px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border shadow-xl",
            currentUser?.subscription === SubscriptionStatus.PRO 
              ? 'bg-green-500/10 text-green-400 border-green-500/30 shadow-green-500/10' 
              : currentUser?.subscription === SubscriptionStatus.PENDING 
              ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30 shadow-yellow-500/10'
              : 'bg-slate-500/10 text-slate-400 border-slate-500/30 shadow-slate-500/5'
          )}>
            {currentUser?.subscription === SubscriptionStatus.PRO ? 'Pro Plan Active' : 
             currentUser?.subscription === SubscriptionStatus.PENDING ? 'Verification Pending' : 
             'Free Plan'}
          </div>
        </motion.div>

        {currentUser?.subscription === SubscriptionStatus.FREE && (
           <motion.div 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             className="glass p-8 rounded-[2.5rem] bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20 flex flex-col md:flex-row justify-between items-center gap-8"
           >
              <div className="space-y-2 text-center md:text-left">
                <h3 className="text-2xl font-black flex items-center justify-center md:justify-start gap-3">
                  Upgrade to Pro <span className="text-[10px] py-1 px-3 bg-indigo-500 rounded-full text-white font-black italic tracking-widest">HOT</span>
                </h3>
                <p className="text-slate-400 font-medium">Unlock unlimited 100-question tests with timer for just ₹{appConfig.subscriptionPrice}/mo.</p>
              </div>
              <button 
                onClick={() => setCurrentPage('payment')}
                className="w-full md:w-auto px-10 py-4 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-black text-lg shadow-xl shadow-indigo-500/30 whitespace-nowrap transition-all active:scale-95"
              >
                Go Pro Now
              </button>
           </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="glass p-10 rounded-[3rem] space-y-8 shadow-2xl shadow-indigo-500/5 border-white/10">
              <div className="space-y-3">
                <h3 className="text-3xl font-black tracking-tight">New Mock Test</h3>
                <p className="text-slate-400 font-medium">What are we studying today? Enter exam name or subject.</p>
              </div>
              
              <div className="space-y-6">
                <div className="relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                    <Search size={24} />
                  </div>
                  <input 
                    type="text"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. SSC CGL Quant, Modern History..."
                    className="w-full pl-16 pr-6 py-6 bg-white/[0.03] border border-white/10 rounded-[2rem] focus:outline-none focus:border-indigo-500/50 text-xl transition-all font-bold"
                  />
                </div>

                <div className="flex items-center gap-6 px-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Select Language:</span>
                  <div className="flex glass p-1.5 rounded-2xl border border-white/5">
                    {(['English', 'Hindi'] as const).map(lang => (
                      <button 
                        key={lang}
                        onClick={() => setTestLanguage(lang)}
                        className={cn(
                          "px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                          testLanguage === lang ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:text-slate-300"
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-5 pt-4">
                <button 
                  disabled={isLoading}
                  onClick={() => startTest(topic, false, testLanguage)}
                  className="flex-1 py-5 glass hover:bg-white/10 rounded-2xl font-black text-slate-300 border border-white/10 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <Zap size={20} />}
                  {isLoading ? 'Generating...' : `5-Q Quick Test`}
                </button>
                <button 
                  disabled={isLoading || (currentUser?.subscription === SubscriptionStatus.FREE && currentUser?.trialsUsed >= 1)}
                  onClick={() => startTest(topic, true, testLanguage)}
                  className="flex-1 py-5 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-black text-white shadow-xl shadow-indigo-500/30 transition-all active:scale-95 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 flex items-center justify-center gap-3"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <Trophy size={20} />}
                  {isLoading ? 'Generating...' : 
                   (currentUser?.subscription === SubscriptionStatus.FREE ? `Full 100-Q Trial (${1 - (currentUser?.trialsUsed || 0)} left)` : 
                    currentUser?.subscription === SubscriptionStatus.PENDING ? `Verification Pending` : 
                    `Full 100-Q Test`)}
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-2xl font-black flex items-center gap-3 px-2 tracking-tight">
                <History className="text-indigo-400" /> Recent Performance
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {testResults.length === 0 ? (
                  <div className="col-span-full glass p-16 text-center rounded-[3rem] border-white/5">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-600">
                      <FileText size={32} />
                    </div>
                    <p className="text-slate-500 font-bold">No tests taken yet. Start your first prep today!</p>
                  </div>
                ) : (
                  testResults.map((res, i) => (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      key={res.id} 
                      className="glass p-6 rounded-[2.5rem] flex items-center justify-between border-white/5 hover:border-indigo-500/30 transition-colors group"
                    >
                      <div className="space-y-1">
                        <h4 className="font-black text-lg group-hover:text-indigo-400 transition-colors">{res.examName}</h4>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          {new Date(res.date).toLocaleDateString()} • {res.total} Qs
                        </p>
                      </div>
                      <div className="text-right">
                        <div className={cn(
                          "text-3xl font-black tracking-tighter",
                          res.percentage >= 70 ? 'text-green-400' : res.percentage >= 40 ? 'text-yellow-400' : 'text-red-400'
                        )}>
                          {res.percentage.toFixed(0)}%
                        </div>
                        <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">Accuracy</div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="glass p-8 rounded-[3rem] border-white/10 space-y-6">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Quick Stats</h4>
              <div className="space-y-6">
                {[
                  { label: 'Total Tests', val: testResults.length, icon: FileText, color: 'text-blue-400' },
                  { label: 'Avg Accuracy', val: `${(testResults.reduce((acc, r) => acc + r.percentage, 0) / (testResults.length || 1)).toFixed(0)}%`, icon: Target, color: 'text-emerald-400' },
                  { label: 'Free Tests Left', val: Math.max(0, 1 - (currentUser?.trialsUsed || 0)), icon: Zap, color: 'text-amber-400' }
                ].map((stat, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className={cn("p-3 rounded-2xl bg-white/5", stat.color)}>
                      <stat.icon size={20} />
                    </div>
                    <div>
                      <div className="text-2xl font-black tracking-tighter">{stat.val}</div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">{stat.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass p-8 rounded-[3rem] border-white/10 bg-gradient-to-br from-purple-500/5 to-indigo-500/5">
              <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6">Study Tip</h4>
              <p className="text-slate-400 text-sm leading-relaxed font-medium italic">
                "Consistency is key. Even a 5-question mock test daily can significantly improve your retention over time."
              </p>
            </div>
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
      <div className="pt-32 pb-20 px-6 flex justify-center items-start min-h-screen">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-xl space-y-10"
        >
          <div className="text-center space-y-3">
            <h2 className="text-5xl font-black tracking-tight">Upgrade to <span className="gradient-text">Pro</span></h2>
            <p className="text-slate-400 font-medium">Unlock unlimited AI generation and compete at elite levels.</p>
          </div>
          
          <div className="glass p-10 rounded-[3rem] space-y-10 text-center shadow-2xl shadow-indigo-500/10 border-white/10">
            <div className="space-y-8">
              <div className="relative w-72 h-72 bg-white mx-auto rounded-[2.5rem] flex items-center justify-center p-6 shadow-[0_0_60px_rgba(99,102,241,0.3)] group overflow-hidden">
                <img src={qrUrl} alt="UPI Payment QR" className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-500" />
                <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </div>

              <div className="pt-4">
                <a 
                  href={upiUri} 
                  className="inline-flex items-center justify-center gap-3 w-full py-6 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 rounded-2xl font-black text-lg shadow-xl shadow-indigo-500/30 transition-all active:scale-95"
                >
                  Pay via UPI App <ArrowRight size={24} />
                </a>
              </div>

              <div className="pt-2 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Total Amount</p>
                <div className="text-6xl font-black text-white tracking-tighter">₹{appConfig.subscriptionPrice}</div>
              </div>
            </div>

            <div className="space-y-6 text-left border-t border-white/5 pt-10">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1 flex items-center gap-2">
                  <AlertCircle size={14} className="text-indigo-400" /> Enter 12-digit UTR / Transaction ID
                </label>
                <input 
                  type="text" 
                  value={utr}
                  maxLength={12}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length <= 12) setUtr(val);
                  }}
                  className="w-full px-6 py-5 bg-white/[0.03] border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500/50 transition-all text-center tracking-[0.3em] font-mono text-2xl font-bold"
                  placeholder="0000 0000 0000"
                />
              </div>
              <button 
                disabled={isLoading || utr.length !== 12}
                onClick={() => handlePaymentSubmit(utr)}
                className="w-full py-5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-black text-lg transition-all active:scale-95 disabled:opacity-30 flex items-center justify-center gap-3"
              >
                {isLoading ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={20} />}
                {isLoading ? 'Verifying...' : 'Submit for Verification'}
              </button>
            </div>

            <div className="flex items-center justify-center gap-6 pt-4">
               {['Secure', 'Instant', '24/7 Support'].map(tag => (
                 <div key={tag} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-600">
                   <div className="w-1 h-1 bg-indigo-500 rounded-full"></div> {tag}
                 </div>
               ))}
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  const ProfilePage = () => {
    if (!currentUser) return null;

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="pt-24 pb-12 px-6 flex flex-col items-center max-w-2xl mx-auto space-y-8"
      >
        <div className="text-center space-y-4">
          <div className="w-24 h-24 bg-indigo-500/10 rounded-full mx-auto flex items-center justify-center text-indigo-400 border border-indigo-500/20">
            <UserCircle size={48} />
          </div>
          <h2 className="text-4xl font-black tracking-tight">{currentUser.fullName}</h2>
          <p className="text-slate-400">Manage your profile and subscription</p>
        </div>

        <div className="w-full glass p-8 rounded-[2.5rem] space-y-8">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-500/10 rounded-lg text-slate-400">
                    <UserCircle size={18} />
                  </div>
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Full Name</span>
                </div>
                <span className="font-bold text-slate-200">{currentUser.fullName}</span>
              </div>
              <div className="flex justify-between items-center p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-500/10 rounded-lg text-slate-400">
                    <Mail size={18} />
                  </div>
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Email Address</span>
                </div>
                <span className="font-bold text-slate-200">{currentUser.email}</span>
              </div>

              <div className="flex justify-between items-center p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                    <ShieldCheck size={18} />
                  </div>
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Subscription</span>
                </div>
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                  currentUser.subscription === SubscriptionStatus.PRO ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' :
                  currentUser.subscription === SubscriptionStatus.PENDING ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                  'bg-slate-500/20 text-slate-400 border-slate-500/30'
                )}>
                  {currentUser.subscription}
                </span>
              </div>

              <div className="flex justify-between items-center p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                    <Zap size={18} />
                  </div>
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Full Test Trials</span>
                </div>
                <span className="font-bold text-slate-200">{currentUser.trialsUsed}/3</span>
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            {!currentUser.isAdmin && (
              <button 
                onClick={() => setCurrentPage('dashboard')}
                className="w-full py-4 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border border-indigo-500/20"
              >
                <BarChart3 size={18} /> Dashboard
              </button>
            )}
            {currentUser.isAdmin && (
              <button 
                onClick={() => setCurrentPage('admin')}
                className="w-full py-4 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border border-purple-500/20"
              >
                <ShieldCheck size={18} /> Admin Panel
              </button>
            )}
            <button 
              onClick={handleLogout}
              className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border border-red-500/20"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const AdminPanel = () => {
    const [upi, setUpi] = useState(appConfig.upiId);
    const [price, setPrice] = useState(appConfig.subscriptionPrice);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyToClipboard = (text: string, id: string) => {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    };

    const updateConfig = async () => {
      setIsLoading(true);
      try {
        const { error: configError } = await supabase
          .from('config')
          .update({ upi_id: upi, subscription_price: Number(price) })
          .eq('id', 1); // Assuming single config row with id 1

        if (configError) throw configError;

        setAppConfig({ upiId: upi, subscriptionPrice: Number(price) });
        showAlert("Success", "Config Updated!");
      } catch (err: any) {
        showAlert("Error", "Failed to update config: " + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    const clearAllData = () => {
      showConfirm(
        "Clear All Data",
        "Are you sure? This will delete all users, results, and reset the app.",
        async () => {
          setIsLoading(true);
          try {
            await supabase.from('results').delete().neq('id', '0');
            await supabase.from('users').delete().neq('id', '0');
            localStorage.clear();
            window.location.reload();
          } catch (err: any) {
            showAlert("Error", "Failed to clear data: " + err.message);
          } finally {
            setIsLoading(false);
          }
        }
      );
    };

    const deleteUser = (userId: string) => {
      showConfirm(
        "Delete User",
        "Are you sure you want to delete this user? This action cannot be undone.",
        async () => {
          setIsLoading(true);
          try {
            await supabase.from('results').delete().eq('user_id', userId);
            await supabase.from('users').delete().eq('id', userId);

            setUsers(prev => prev.filter(u => u.id !== userId));
            
            if (currentUser?.id === userId) {
              handleLogout();
            }
            showAlert("Deleted", "User account removed successfully.");
          } catch (err: any) {
            showAlert("Error", "Failed to delete user: " + err.message);
          } finally {
            setIsLoading(false);
          }
        }
      );
    };

    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="pt-24 pb-12 px-6 max-w-6xl mx-auto space-y-12"
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <h2 className="text-4xl font-black tracking-tight">Admin <span className="text-indigo-400">Control Center</span></h2>
            <p className="text-slate-500 font-medium">Manage platform configuration and user access</p>
          </div>
          <button 
            onClick={clearAllData}
            className="px-6 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2"
          >
            <Trash2 size={16} /> Clear All Data
          </button>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-6">
            <div className="glass p-8 rounded-[2.5rem] space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400">
                  <Settings size={20} />
                </div>
                <h3 className="font-bold text-xl">Platform Settings</h3>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Backend UPI ID</label>
                  <input 
                    type="text" 
                    value={upi}
                    onChange={e => setUpi(e.target.value)}
                    className="w-full px-5 py-4 bg-white/[0.03] border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500/50 transition-all font-mono text-sm"
                    placeholder="e.g. yourname@upi"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Subscription Price (₹)</label>
                  <input 
                    type="number" 
                    value={price}
                    onChange={e => setPrice(Number(e.target.value))}
                    className="w-full px-5 py-4 bg-white/[0.03] border border-white/10 rounded-2xl focus:outline-none focus:border-indigo-500/50 transition-all font-mono text-sm"
                    placeholder="e.g. 100"
                  />
                </div>
                <button 
                  onClick={updateConfig} 
                  className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 glass p-8 rounded-[2.5rem] space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-400">
                <ShieldCheck size={20} />
              </div>
              <h3 className="font-bold text-xl">User Management</h3>
            </div>

            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-left border-separate border-spacing-y-3">
                <thead>
                  <tr className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                    <th className="px-4 pb-2">User</th>
                    <th className="px-4 pb-2">Status</th>
                    <th className="px-4 pb-2">UTR</th>
                    <th className="px-4 pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="group">
                      <td className="px-4 py-4 bg-white/[0.02] rounded-l-2xl border-y border-l border-white/[0.05]">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold text-xs">
                            {user.fullName.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-200">{user.fullName}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 font-mono">{user.email}</span>
                              <span className="text-[10px] text-slate-600 font-mono">| {user.password}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 bg-white/[0.02] border-y border-white/[0.05]">
                        <span className={cn(
                          "text-[9px] px-2 py-1 rounded-lg font-black uppercase tracking-widest border",
                          user.subscription === SubscriptionStatus.PRO ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                          user.subscription === SubscriptionStatus.PENDING ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                          'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        )}>
                          {user.subscription}
                        </span>
                      </td>
                      <td className="px-4 py-4 bg-white/[0.02] border-y border-white/[0.05]">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400">{user.utr || '—'}</span>
                          {user.utr && (
                            <button 
                              onClick={() => copyToClipboard(user.utr!, user.id)}
                              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-slate-500 hover:text-indigo-400"
                              title="Copy UTR"
                            >
                              {copiedId === user.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 bg-white/[0.02] rounded-r-2xl border-y border-r border-white/[0.05] text-right">
                        <div className="flex items-center justify-end gap-2">
                          {user.subscription === SubscriptionStatus.PENDING && (
                            <button 
                              onClick={() => approvePayment(user.id)} 
                              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                            >
                              Approve
                            </button>
                          )}
                          {!user.isAdmin && (
                            <button 
                              onClick={() => deleteUser(user.id)} 
                              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                              title="Delete User"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </motion.div>
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
              <Timer size={24} />
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
                {selected === idx && <Check size={20} />}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex gap-4">
          <button disabled={activeQuestionIndex === 0} onClick={() => setActiveQuestionIndex(prev => prev - 1)} className="px-6 py-4 glass rounded-2xl font-bold hover:bg-white/10 disabled:opacity-30 flex items-center gap-2">
            <ChevronLeft size={20} /> Previous
          </button>
          {activeQuestionIndex < currentTest.questions.length - 1 ? (
            <button disabled={!hasSelected} onClick={() => setActiveQuestionIndex(prev => prev + 1)} className={`flex-1 py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all ${hasSelected ? 'bg-indigo-500 hover:bg-indigo-600 shadow-indigo-500/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
              Next <ChevronRight size={20} />
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
            <Trophy size={48} />
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

  const Modal = () => (
    <AnimatePresence>
      {modal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-sm glass p-8 rounded-[2.5rem] border-white/10 shadow-2xl space-y-6"
          >
            <div className="space-y-2 text-center">
              <h3 className="text-2xl font-black tracking-tight">{modal.title}</h3>
              <p className="text-slate-400 font-medium">{modal.message}</p>
            </div>
            <div className="flex gap-3">
              {modal.type === 'confirm' && (
                <button 
                  onClick={() => setModal(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 py-4 glass hover:bg-white/10 rounded-2xl font-bold transition-all"
                >
                  Cancel
                </button>
              )}
              <button 
                onClick={() => {
                  const confirmFn = modal.onConfirm;
                  setModal(prev => ({ ...prev, isOpen: false }));
                  confirmFn();
                }}
                className="flex-1 py-4 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-bold shadow-lg shadow-indigo-500/20 transition-all"
              >
                {modal.type === 'confirm' ? 'Confirm' : 'OK'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Navbar />
      <Modal />
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
            <p className="font-bold text-lg">{loadingMessage}</p>
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
