
import React, { useState, useEffect, useCallback, useMemo, useRef, Component } from 'react';
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
  EyeOff,
  Star
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  User, 
  SubscriptionStatus, 
  Question, 
  TestResult, 
  AppConfig,
  Difficulty
} from './types';
import { generateQuestions } from './services/geminiService';
import { auth, db } from './firebase';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import PrivacyPolicy from './components/PrivacyPolicy';
import TermsAndConditions from './components/TermsAndConditions';
import ContactUs from './components/ContactUs';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy,
  onSnapshot,
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const getRating = (percentage: number) => {
  if (percentage >= 90) return { label: 'Excellent', stars: 5, color: 'text-green-400' };
  if (percentage >= 75) return { label: 'Very Good', stars: 4, color: 'text-emerald-400' };
  if (percentage >= 50) return { label: 'Good', stars: 3, color: 'text-yellow-400' };
  if (percentage >= 35) return { label: 'Average', stars: 2, color: 'text-orange-400' };
  return { label: 'Poor', stars: 1, color: 'text-red-400' };
};

// --- Local Storage Keys ---
const CONFIG_KEY = 'tt_config';
const RESULTS_KEY = 'tt_results';
const USERS_KEY = 'tt_users';
const CURRENT_USER_KEY = 'tt_current_user';

// --- Mock Initial Config ---
const DEFAULT_CONFIG: AppConfig = {
  upiId: '8839191411@ibl',
  subscriptionPrice: 1,
};


enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

// --- Helper Components ---
const formatTime = (s: number) => {
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const TestInterface = ({ 
  currentTest, 
  activeQuestionIndex, 
  userAnswers, 
  timeLeft, 
  setActiveQuestionIndex, 
  setUserAnswers, 
  submitTest 
}: {
  currentTest: any;
  activeQuestionIndex: number;
  userAnswers: number[];
  timeLeft: number;
  setActiveQuestionIndex: React.Dispatch<React.SetStateAction<number>>;
  setUserAnswers: React.Dispatch<React.SetStateAction<number[]>>;
  submitTest: () => void;
}) => {
  if (!currentTest) return null;
  const q = currentTest.questions[activeQuestionIndex];
  const selected = userAnswers[activeQuestionIndex];
  const hasSelected = selected !== -1;

  return (
    <div className="pt-24 pb-12 px-6 min-h-screen flex flex-col max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4 glass p-4 rounded-2xl">
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

      {/* Progress Bar */}
      <div className="w-full h-1.5 bg-white/5 rounded-full mb-8 overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${((activeQuestionIndex + 1) / currentTest.questions.length) * 100}%` }}
          className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={activeQuestionIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="flex-1 glass p-8 rounded-[2rem] space-y-8 shadow-[0_0_50px_rgba(99,102,241,0.1)]"
        >
          <div className="space-y-4">
            <div className="text-xs font-black text-indigo-400 uppercase tracking-widest">Question {activeQuestionIndex + 1}</div>
            <h2 className="text-xl md:text-2xl font-bold leading-relaxed">{q.text}</h2>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {q.options.map((opt: string, idx: number) => (
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
        </motion.div>
      </AnimatePresence>

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

const ResultPage = ({ lastResult, navigate }: { lastResult: TestResult | null, navigate: any }) => {
  const [reviewMode, setReviewMode] = useState(false);
  if (!lastResult) return null;

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
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="pt-24 pb-12 px-6 flex flex-col items-center max-w-3xl mx-auto space-y-8"
    >
      <div className="text-center space-y-2">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 10 }}
          className="w-20 h-20 bg-yellow-500/20 rounded-full mx-auto flex items-center justify-center text-yellow-500"
        >
          <Trophy size={48} />
        </motion.div>
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
           <motion.div 
             key={i} 
             whileHover={{ y: -5, scale: 1.02 }}
             className="glass-card p-6 rounded-[2rem] text-center space-y-1"
           >
             <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{stat.label}</div>
             <div className={`text-2xl font-black ${stat.color}`}>{stat.value}</div>
           </motion.div>
         ))}
      </div>
      <div className="w-full glass p-8 rounded-[2rem] space-y-6">
        <div className="flex flex-col gap-4">
          <button onClick={() => setReviewMode(true)} className="w-full py-4 glass hover:bg-white/10 rounded-2xl font-bold">Review Answers</button>
          <button onClick={() => navigate('/dashboard')} className="w-full py-4 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-bold shadow-xl shadow-indigo-500/30">Back to Dashboard</button>
        </div>
      </div>
    </motion.div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

// --- Error Boundary Component ---
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("App Crash:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center space-y-6">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
            <AlertCircle size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white">Something went wrong</h2>
            <p className="text-slate-400 max-w-xs mx-auto">The application encountered an unexpected error and needs to restart.</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-4 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-bold text-white shadow-xl shadow-indigo-500/20 transition-all"
          >
            Reload Application
          </button>
          {process.env.NODE_ENV !== 'production' && (
            <pre className="mt-8 p-4 bg-black/40 rounded-xl text-left text-[10px] text-red-400 overflow-auto max-w-full">
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }
    return (this as any).props.children;
  }
}

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // --- Connection Test ---
  useEffect(() => {
    const testConnection = async () => {
      try {
        // Use getDocFromServer to bypass cache and check real connectivity
        await getDocFromServer(doc(db, 'config', 'connection_test'));
        console.log('Firestore connectivity verified');
      } catch (error: any) {
        if (error.message?.includes('the client is offline')) {
          console.warn("Firestore is currently in offline mode. The app will use cached data.");
        }
      }
    };
    testConnection();
  }, []);

  // --- State ---
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
  const [testDifficulty, setTestDifficulty] = useState<Difficulty>('Medium');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const loadingRef = useRef(false);
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

  const setIsLoadingWithRef = (val: boolean) => {
    loadingRef.current = val;
    setIsLoading(val);
  };

  // --- Auth & Persistence Initialization ---
  useEffect(() => {
    // Safety timeout
    const timer = setTimeout(() => {
      if (loadingRef.current) {
        setIsLoadingWithRef(false);
      }
    }, 30000);

    const initApp = async (retries = 3) => {
      console.log(`Initializing app with Firebase (Attempt ${4 - retries})...`);
      
      try {
        // 1. Initial User Check from LocalStorage (for faster UI)
        const savedUser = localStorage.getItem(CURRENT_USER_KEY);
        if (savedUser) {
          setCurrentUser(JSON.parse(savedUser));
        }

        // 2. Load Config from Firestore
        let configDoc;
        try {
          configDoc = await getDoc(doc(db, 'config', 'global'));
        } catch (err: any) {
          if (retries > 0 && err.message?.includes('offline')) {
            console.warn('Firestore offline, retrying in 2s...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            return initApp(retries - 1);
          }
          const info = handleFirestoreError(err, OperationType.GET, 'config/global');
          throw new Error(JSON.stringify(info));
        }

        if (configDoc && configDoc.exists()) {
          const data = configDoc.data();
          setAppConfig({
            upiId: data.upiId || DEFAULT_CONFIG.upiId,
            subscriptionPrice: data.subscriptionPrice || DEFAULT_CONFIG.subscriptionPrice
          });
        } else {
          setAppConfig(DEFAULT_CONFIG);
        }
      } catch (err) {
        console.error('Error initializing app:', err);
        // Don't block the whole app if just config fails
        setAppConfig(DEFAULT_CONFIG);
      } finally {
        clearTimeout(timer);
        setIsLoadingWithRef(false);
      }
    };

    initApp();

    // 3. Firebase Auth State Listener
    let userUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Firebase Auth State Change:', user ? 'Logged In' : 'Logged Out');
      
      if (userUnsubscribe) {
        userUnsubscribe();
        userUnsubscribe = null;
      }

      if (user) {
        // Set up real-time listener for user document
        userUnsubscribe = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data();
            const subscription = userData.subscription as SubscriptionStatus;
            
            const formattedUser: User = {
              id: user.uid,
              fullName: userData.fullName,
              email: userData.email,
              password: userData.password,
              subscription: subscription,
              trialsUsed: userData.trialsUsed,
              isAdmin: userData.isAdmin,
              sessionId: userData.sessionId,
              payment_id: userData.payment_id,
              updated_at: userData.updated_at
            };
            
            setCurrentUser(formattedUser);
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(formattedUser));
            
            // Auto-navigate if on auth/home
            if (location.pathname === '/auth' || location.pathname === '/') {
              navigate(formattedUser.isAdmin ? '/admin' : '/dashboard');
            }
          } else {
            // Fallback if doc doesn't exist yet
            const isAdmin = user.email === 'lallusinghnetam0@gmail.com';
            const fallbackUser: User = {
              id: user.uid,
              fullName: user.displayName || 'User',
              email: user.email || '',
              subscription: isAdmin ? SubscriptionStatus.PRO : SubscriptionStatus.FREE,
              trialsUsed: 0,
              isAdmin: isAdmin
            };
            setCurrentUser(fallbackUser);
          }
        }, (err) => {
          console.error("User doc listener error:", err);
        });
      } else {
        setCurrentUser(null);
        localStorage.removeItem(CURRENT_USER_KEY);
        if (location.pathname !== '/' && location.pathname !== '/auth') {
          navigate('/');
        }
      }
    });

    return () => {
      unsubscribe();
      if (userUnsubscribe) userUnsubscribe();
      clearTimeout(timer);
    };
  }, []);

  // --- Load Test Results ---
  useEffect(() => {
    if (!currentUser) {
      setTestResults([]);
      return;
    }

    // Real-time listener for results
    const q = query(collection(db, 'results'), where('userId', '==', currentUser.id), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        questions: JSON.parse(doc.data().questions),
        userAnswers: JSON.parse(doc.data().userAnswers)
      })) as TestResult[];
      setTestResults(results);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'results');
    });

    return () => unsubscribe();
  }, [currentUser]);

  // --- Scroll to top on page change ---
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  // --- Admin User Loading ---
  useEffect(() => {
    if (location.pathname === '/admin' && currentUser?.isAdmin) {
      const q = query(collection(db, 'users'), orderBy('email'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const usersList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as User[];
        setUsers(usersList);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'users');
      });
      return () => unsubscribe();
    }
  }, [location.pathname, currentUser]);

  // --- Firebase Auth Handlers ---
  const handleAuth = async (fullName: string, email: string, pass: string, confirmPass?: string) => {
    setError(null);
    setSuccessMessage(null);
    setLoadingMessage(authMode === 'login' ? 'Logging in...' : 'Creating account...');
    setIsLoadingWithRef(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = pass.trim();

    const authTimeout = setTimeout(() => {
      if (loadingRef.current) {
        setIsLoadingWithRef(false);
        setError("The server is taking too long to respond. Please check your connection.");
      }
    }, 60000);

    try {
      if (authMode === 'signup') {
        if (!fullName.trim() || !cleanEmail || !cleanPass || !confirmPass) {
          throw new Error('All fields are required!');
        }
        if (cleanPass !== confirmPass.trim()) {
          throw new Error('Passwords do not match!');
        }

        // 1. Firebase Signup
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
        const user = userCredential.user;
        
        // Update profile with name
        await updateProfile(user, { displayName: fullName.trim() });

        const isAdmin = cleanEmail === 'lallusinghnetam0@gmail.com';
        const newSessionId = Math.random().toString(36).substring(7);
        
        const formattedUser: User = {
          id: user.uid,
          fullName: fullName.trim(),
          email: cleanEmail,
          password: cleanPass,
          subscription: isAdmin ? SubscriptionStatus.PRO : SubscriptionStatus.FREE,
          trialsUsed: 0,
          isAdmin: isAdmin,
          sessionId: newSessionId
        };

        // TURANT LOGIN: Set state and navigate
        setCurrentUser(formattedUser);
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(formattedUser));
        navigate(isAdmin ? '/admin' : '/dashboard');
        setIsLoadingWithRef(false);
        clearTimeout(authTimeout);

        // Background sync to Firestore
        setDoc(doc(db, 'users', user.uid), formattedUser).catch(e => console.error('Firestore sync error:', e));
        
      } else {
        // Firebase Login
        const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPass);
        const user = userCredential.user;

        const isAdmin = cleanEmail === 'lallusinghnetam0@gmail.com';
        const newSessionId = Math.random().toString(36).substring(7);

        // Immediate partial user for navigation
        const immediateUser: User = {
          id: user.uid,
          fullName: user.displayName || 'User',
          email: user.email || '',
          subscription: isAdmin ? SubscriptionStatus.PRO : SubscriptionStatus.FREE,
          trialsUsed: 0,
          isAdmin: isAdmin,
          sessionId: newSessionId
        };

        setCurrentUser(immediateUser);
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(immediateUser));
        navigate(isAdmin ? '/admin' : '/dashboard');
        setIsLoadingWithRef(false);
        clearTimeout(authTimeout);

        // Background sync: Fetch full data and update session
        getDoc(doc(db, 'users', user.uid)).then(async (userDoc) => {
          if (userDoc.exists()) {
            const fullUser = { ...userDoc.data(), sessionId: newSessionId } as User;
            setCurrentUser(fullUser);
            localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(fullUser));
            updateDoc(doc(db, 'users', user.uid), { sessionId: newSessionId });
          } else {
            // Create doc if missing (migration case)
            setDoc(doc(db, 'users', user.uid), immediateUser);
          }
        });
      }
    } catch (err: any) {
      console.error('Auth Error:', err);
      let msg = err.message;
      if (msg.includes('auth/invalid-credential')) msg = "Invalid email or password.";
      if (msg.includes('auth/email-already-in-use')) msg = "This email is already registered.";
      setError(msg);
    } finally {
      clearTimeout(authTimeout);
      setIsLoadingWithRef(false);
    }
  };

  const handleResetPassword = async (email: string, newPass: string, confirmPass: string) => {
    // Firebase handles reset via sendPasswordResetEmail usually, 
    // but keeping current custom logic for now by updating Firestore if user exists
    setError("Password reset via email is being configured. Please contact support.");
  };

  const handleLogout = async () => {
    localStorage.removeItem(CURRENT_USER_KEY);
    localStorage.removeItem(RESULTS_KEY);
    localStorage.removeItem(USERS_KEY);
    setCurrentUser(null);
    navigate('/');
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // --- Test Logic ---
  const startTest = async (topic: string, isPro: boolean, lang: 'English' | 'Hindi', difficulty: Difficulty) => {
    if (!currentUser) return;

    const fullTrialsCount = testResults.filter(r => r.total === 100).length;
    const quickTrialsCount = testResults.filter(r => r.total === 5).length;

    // Restriction Logic
    if (isPro) {
      if (currentUser.subscription === SubscriptionStatus.PENDING) {
        showAlert("Verification Pending", "Your payment is currently being verified by our team. Please wait for approval to access full 100-question tests.");
        return;
      }
      if (currentUser.subscription === SubscriptionStatus.FREE && fullTrialsCount >= 1) {
        showAlert("Trial Limit Reached", "You have used your 1 free 100-question trial. Please upgrade to Pro for unlimited access.");
        navigate('/payment');
        return;
      }
    } else {
      // For 5-Q Quick Test, limit to 3 trials
      if (currentUser.subscription === SubscriptionStatus.FREE && quickTrialsCount >= 3) {
        showAlert("Trial Limit Reached", "You have used your 3 free 5-question trials. Please upgrade to Pro for unlimited access.");
        navigate('/payment');
        return;
      }
    }

    if (!topic.trim()) {
      setError("Please enter an exam or subject name.");
      return;
    }

    setLoadingMessage('Starting your test...');
    setIsLoadingWithRef(true);
    setError(null);
    try {
      const count = isPro ? 100 : 5;
      const questions = await generateQuestions(topic, count, lang, difficulty);
      setCurrentTest({ topic, questions, isPro, language: lang });
      setUserAnswers(new Array(questions.length).fill(-1));
      setActiveQuestionIndex(0);
      setTimeLeft(isPro ? 50 * 60 : 0);
      navigate('/test');
    } catch (err: any) {
      console.error('Test Generation Error:', err);
      setError(err.message || 'Failed to generate test. Please try again.');
    } finally {
      setIsLoadingWithRef(false);
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
      // Save result to Firestore
      const resultRef = doc(collection(db, 'results'));
      await setDoc(resultRef, {
        id: result.id,
        userId: result.userId,
        examName: result.examName,
        score: result.score,
        total: result.total,
        correct: result.correct,
        wrong: result.wrong,
        percentage: result.percentage,
        date: result.date,
        questions: JSON.stringify(result.questions),
        userAnswers: JSON.stringify(result.userAnswers)
      });

      const newResults = [result, ...testResults];
      setTestResults(newResults);

      // Update trial status if free
      if (currentUser.subscription === SubscriptionStatus.FREE) {
        const updatedTrials = currentUser.trialsUsed + 1;
        const updatedUser = { ...currentUser, trialsUsed: updatedTrials };
        
        await updateDoc(doc(db, 'users', currentUser.id), { trialsUsed: updatedTrials });

        setUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
        setCurrentUser(updatedUser);
      }

      setLastResult(result);
      navigate('/result');
      setCurrentTest(null);
    } catch (err) {
      console.error('Error saving test result:', err);
      showAlert('Error', 'Failed to save test result. Please check your connection.');
    }
  }, [currentTest, currentUser, userAnswers, testResults, users]);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (location.pathname === '/test' && currentTest?.isPro && timeLeft > 0) {
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
  }, [location.pathname, currentTest, timeLeft, submitTest]);

  // --- Payment Handler ---
  const handleRazorpayPayment = async () => {
    if (!currentUser) return;
    
    setIsLoadingWithRef(true);
    try {
      const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!keyId) {
        throw new Error("Razorpay Key ID is missing. Please check your environment variables.");
      }
      console.log("Initiating payment with Key ID:", keyId.substring(0, 8) + "...");

      // 1. Create Order on Server
      const response = await fetch('/api/payment/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: appConfig.subscriptionPrice,
          currency: 'INR'
        })
      });
      
      const responseText = await response.text();
      let order;
      try {
        order = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse payment order response:", responseText);
        throw new Error(`Server returned HTML instead of JSON. This usually means the API route was not found or the server crashed. Response: ${responseText.substring(0, 100)}...`);
      }
      
      if (!response.ok) {
        throw new Error(order.details || order.error || 'Failed to create payment order');
      }

      if (!order.id) {
        throw new Error('Invalid order response from server');
      }

      // 2. Trigger Razorpay Popup
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "TestTrail AI",
        description: "Pro Subscription",
        order_id: order.id,
        modal: {
          ondismiss: () => {
            setIsLoadingWithRef(false);
          },
          escape: false,
          backdropclose: false
        },
        handler: async (response: any) => {
          try {
            setIsLoadingWithRef(true);
            setLoadingMessage('Verifying payment...');
            
            // 3. Verify Payment on Server
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                userId: currentUser.id
              })
            });
            
            const verifyText = await verifyRes.text();
            let verifyData;
            try {
              verifyData = JSON.parse(verifyText);
            } catch (e) {
              throw new Error("Invalid verification response from server.");
            }
            
            if (verifyData.status === 'success') {
              // 4. Update local state (Server already updated Firestore)
              const updatedUser: User = { 
                ...currentUser, 
                subscription: SubscriptionStatus.PRO,
                subscriptionExpiresAt: verifyData.expiresAt
              };
              setCurrentUser(updatedUser);
              localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
              showAlert("Success", "Welcome to Pro! Your subscription is now active for 30 days.");
              navigate('/dashboard');
            } else {
              showAlert("Payment Verification Failed", verifyData.message || "Could not verify payment.");
            }
          } catch (err: any) {
            showAlert("Error", "Verification failed: " + err.message);
          } finally {
            setIsLoadingWithRef(false);
          }
        },
        prefill: {
          name: currentUser.fullName,
          email: currentUser.email,
          contact: "" // Optional: can add phone if collected
        },
        theme: {
          color: "#6366f1"
        }
      };

      if (!(window as any).Razorpay) {
        setIsLoadingWithRef(false);
        showAlert("Payment Error", "Razorpay SDK is not loaded. Please refresh the page and try again.");
        return;
      }

      const rzp = new (window as any).Razorpay(options);
      
      rzp.on('payment.failed', function (response: any) {
        console.error("Payment Failed:", response.error);
        showAlert("Payment Failed", response.error.description || "Payment was unsuccessful. Please try again.");
        setIsLoadingWithRef(false);
      });

      // On mobile, popups can be blocked if triggered after an async call.
      // Razorpay's open() handles this usually, but we ensure it's called.
      try {
        rzp.open();
      } catch (e: any) {
        console.error("RZP Open Error:", e);
        setIsLoadingWithRef(false);
        showAlert("Error", "Could not open payment window. Please check if popups are blocked.");
      }
      
    } catch (err: any) {
      showAlert("Payment Error", "Could not initiate payment: " + err.message);
    } finally {
      setIsLoadingWithRef(false);
    }
  };

  // --- Admin Handlers ---

  // --- UI Components ---
  const Navbar = () => (
    <nav className="fixed top-0 left-0 right-0 z-50 glass h-20 px-6 flex items-center justify-between border-b border-white/10">
      <Link 
        to="/"
        className="flex items-center gap-3 cursor-pointer group" 
      >
        <motion.div 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center font-black text-white shadow-xl shadow-indigo-500/20 group-hover:scale-110 transition-transform"
        >
          T
        </motion.div>
        <span className="text-2xl font-black tracking-tighter">
          Test<span className="gradient-text">Trail</span>
        </span>
      </Link>

      <div className="hidden md:flex items-center gap-8">
        <Link 
          to="/contact" 
          className={cn(
            "text-sm font-bold uppercase tracking-widest transition-colors",
            location.pathname === '/contact' ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
          )}
        >
          Contact
        </Link>
        {currentUser ? (
          <>
            {!currentUser.isAdmin && (
              <Link 
                to="/dashboard" 
                className={cn(
                  "text-sm font-bold uppercase tracking-widest transition-colors",
                  location.pathname === '/dashboard' ? "text-indigo-400" : "text-slate-400 hover:text-slate-200"
                )}
              >
                Dashboard
              </Link>
            )}
            {currentUser.isAdmin && (
              <Link 
                to="/admin" 
                className={cn(
                  "text-sm font-bold uppercase tracking-widest transition-colors",
                  location.pathname === '/admin' ? "text-purple-400" : "text-slate-400 hover:text-slate-200"
                )}
              >
                Admin Panel
              </Link>
            )}
            {!currentUser.isAdmin && (
              <Link 
                to="/profile" 
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-xl transition-all border",
                  location.pathname === '/profile' 
                    ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400" 
                    : "border-transparent text-slate-400 hover:bg-white/5"
                )}
              >
                <UserCircle size={20} />
                <span className="text-sm font-bold">{currentUser.fullName.split(' ')[0]}</span>
              </Link>
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
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setAuthMode('login'); navigate('/auth'); }}
            className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-xl shadow-indigo-500/20 active:scale-95"
          >
            Login
          </motion.button>
        )}
      </div>

      <div className="md:hidden flex items-center gap-2">
        {!currentUser && (
          <button 
            onClick={() => { setAuthMode('login'); navigate('/auth'); }}
            className="px-4 py-2 bg-indigo-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
          >
            Login
          </button>
        )}
        
        <button 
          onClick={() => {
            if (currentUser) {
              if (location.pathname === '/profile') {
                navigate('/');
              } else {
                navigate('/profile');
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
                {!currentUser.isAdmin && <button onClick={() => { navigate('/dashboard'); setIsMobileMenuOpen(false); }} className="text-left font-bold py-2">Dashboard</button>}
                {currentUser.isAdmin && <button onClick={() => { navigate('/admin'); setIsMobileMenuOpen(false); }} className="text-left font-bold py-2 text-purple-400">Admin Panel</button>}
                {!currentUser.isAdmin && <button onClick={() => { navigate('/profile'); setIsMobileMenuOpen(false); }} className="text-left font-bold py-2">Profile</button>}
                <button onClick={() => { navigate('/contact'); setIsMobileMenuOpen(false); }} className="text-left font-bold py-2">Contact Us</button>
                <button onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }} className="text-left font-bold py-2 text-red-400">Logout</button>
              </>
            ) : (
              <>
                <button onClick={() => { navigate('/contact'); setIsMobileMenuOpen(false); }} className="text-left font-bold py-2">Contact Us</button>
                <button onClick={() => { setAuthMode('login'); navigate('/auth'); setIsMobileMenuOpen(false); }} className="w-full py-4 bg-indigo-500 rounded-2xl font-bold">Login / Signup</button>
              </>
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
          <motion.button 
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              if (currentUser) navigate(currentUser.isAdmin ? '/admin' : '/dashboard');
              else { setAuthMode('signup'); navigate('/auth'); }
            }}
            className="w-full sm:w-auto px-10 py-5 bg-indigo-500 hover:bg-indigo-600 rounded-[2rem] font-black text-lg shadow-2xl shadow-indigo-500/40 transition-all flex items-center justify-center gap-3 group active:scale-95"
          >
            Start Mock Test <ChevronRight className="group-hover:translate-x-1 transition-transform" />
          </motion.button>
          <button 
             onClick={() => {
               if (currentUser) navigate(currentUser.isAdmin ? '/admin' : '/dashboard');
               else { setAuthMode('signup'); navigate('/auth'); }
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

            <div className="pt-6 border-t border-white/5 flex justify-center">
              <button 
                onClick={() => showAlert("Connection", "Firebase connection is active.")}
                className="text-[10px] font-black uppercase tracking-widest text-slate-600 hover:text-indigo-400 transition-colors flex items-center gap-2"
              >
                <Zap size={10} /> Check Server Connection
              </button>
            </div>
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
                onClick={() => navigate('/payment')}
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

                <div className="flex flex-col md:flex-row md:items-center gap-6 px-2">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Language:</span>
                    <div className="flex glass p-1 rounded-xl border border-white/5">
                      {(['English', 'Hindi'] as const).map(lang => (
                        <button 
                          key={lang}
                          onClick={() => setTestLanguage(lang)}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                            testLanguage === lang ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:text-slate-300"
                          )}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Difficulty:</span>
                    <div className="flex glass p-1 rounded-xl border border-white/5">
                      {(['Easy', 'Medium', 'Hard'] as const).map(diff => (
                        <button 
                          key={diff}
                          onClick={() => setTestDifficulty(diff)}
                          className={cn(
                            "px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                            testDifficulty === diff ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" : "text-slate-500 hover:text-slate-300"
                          )}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-5 pt-4">
                <button 
                  disabled={isLoading || (currentUser?.subscription === SubscriptionStatus.FREE && testResults.filter(r => r.total === 5).length >= 3)}
                  onClick={() => startTest(topic, false, testLanguage, testDifficulty)}
                  className="flex-1 py-5 glass hover:bg-white/10 rounded-2xl font-black text-slate-300 border border-white/10 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <Zap size={20} />}
                  {isLoading ? 'Generating...' : 
                   (currentUser?.subscription === SubscriptionStatus.FREE ? `5-Q Quick Test (${Math.max(0, 3 - testResults.filter(r => r.total === 5).length)} left)` : `5-Q Quick Test`)}
                </button>
                <button 
                  disabled={isLoading || (currentUser?.subscription === SubscriptionStatus.FREE && testResults.filter(r => r.total === 100).length >= 1)}
                  onClick={() => startTest(topic, true, testLanguage, testDifficulty)}
                  className="flex-1 py-5 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-black text-white shadow-xl shadow-indigo-500/30 transition-all active:scale-95 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 flex items-center justify-center gap-3"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <Trophy size={20} />}
                  {isLoading ? 'Generating...' : 
                   (currentUser?.subscription === SubscriptionStatus.FREE ? `Full 100-Q Trial (${Math.max(0, 1 - testResults.filter(r => r.total === 100).length)} left)` : 
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
                          "text-xl font-black tracking-tighter flex items-center justify-end gap-1",
                          getRating(res.percentage).color
                        )}>
                          {getRating(res.percentage).label}
                        </div>
                        <div className="flex items-center justify-end gap-0.5 mt-1">
                          {[...Array(5)].map((_, i) => (
                            <Star 
                              key={i} 
                              size={10} 
                              className={i < getRating(res.percentage).stars ? getRating(res.percentage).color : 'text-slate-700'} 
                              fill="currentColor" 
                            />
                          ))}
                        </div>
                        <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600 mt-1">Student Rating</div>
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
                  { 
                    label: 'Overall Rating', 
                    val: getRating(testResults.reduce((acc, r) => acc + r.percentage, 0) / (testResults.length || 1)).label, 
                    icon: Star, 
                    color: getRating(testResults.reduce((acc, r) => acc + r.percentage, 0) / (testResults.length || 1)).color 
                  },
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
    return (
      <div className="pt-32 pb-20 px-6 flex justify-center items-start min-h-screen">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-xl space-y-10"
        >
          <div className="text-center space-y-3">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight">Upgrade to <span className="gradient-text">Pro</span></h2>
            <p className="text-slate-400 font-medium text-sm md:text-base">Unlock unlimited AI generation and compete at elite levels.</p>
          </div>
          
          <div className="glass p-6 md:p-10 rounded-[2.5rem] md:rounded-[3rem] space-y-10 text-center shadow-2xl shadow-indigo-500/10 border-white/10">
            <div className="space-y-8">
              <div className="pt-2 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Subscription Plan</p>
                <div className="text-5xl md:text-6xl font-black text-white tracking-tighter">₹{appConfig.subscriptionPrice}</div>
                <p className="text-slate-400 font-bold">30 Days Access</p>
              </div>

              <div className="pt-4">
                <button 
                  disabled={isLoading}
                  onClick={handleRazorpayPayment}
                  className="inline-flex items-center justify-center gap-3 w-full py-6 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 rounded-2xl font-black text-lg shadow-xl shadow-indigo-500/30 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <Zap size={24} />}
                  {isLoading ? 'Processing...' : 'Buy Pro'}
                </button>
              </div>
            </div>

            <div className="space-y-6 text-left border-t border-white/5 pt-10">
              <h4 className="text-xl font-black text-white">Pro Benefits:</h4>
              <ul className="space-y-4">
                {[
                  'Unlimited 100-Question Tests',
                  'Advanced Performance Analytics',
                  'Priority Access',
                  'Ad-Free Experience',
                  '30 Days Premium Access'
                ].map(benefit => (
                  <li key={benefit} className="flex items-center gap-3 text-slate-300 font-medium">
                    <div className="w-5 h-5 bg-green-500/20 rounded-full flex items-center justify-center text-green-400">
                      <CheckCircle2 size={14} />
                    </div>
                    {benefit}
                  </li>
                ))}
              </ul>
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
                onClick={() => navigate('/dashboard')}
                className="w-full py-4 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border border-indigo-500/20"
              >
                <BarChart3 size={18} /> Dashboard
              </button>
            )}
            {currentUser.isAdmin && (
              <button 
                onClick={() => navigate('/admin')}
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

  const AdminPanel = ({ 
    users, 
    appConfig, 
    setAppConfig, 
    setAllUsers, 
    currentUser, 
    handleLogout, 
    setIsLoadingWithRef, 
    showAlert, 
    showConfirm 
  }: any) => {
    const [upi, setUpi] = useState(appConfig.upiId);
    const [price, setPrice] = useState(appConfig.subscriptionPrice);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const copyToClipboard = (text: string, id: string) => {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    };

    const updateConfig = async () => {
      setIsLoadingWithRef(true);
      try {
        await setDoc(doc(db, 'config', 'global'), { subscriptionPrice: Number(price) });
        setAppConfig((prev: any) => ({ ...prev, subscriptionPrice: Number(price) }));
        showAlert("Success", "Price Updated!");
      } catch (err: any) {
        showAlert("Error", "Failed to update config: " + err.message);
      } finally {
        setIsLoadingWithRef(false);
      }
    };

    const clearAllData = () => {
      showConfirm(
        "Clear All Data",
        "Are you sure? This will delete all users, results, and reset the app.",
        async () => {
          setIsLoadingWithRef(true);
          try {
            // Firestore doesn't support bulk delete in a single call easily without a cloud function or batching
            // For this admin tool, we'll just clear local storage as a simple "reset" for the current session
            // Real bulk delete would require iterating through collections
            localStorage.clear();
            window.location.reload();
          } catch (err: any) {
            showAlert("Error", "Failed to clear data: " + err.message);
          } finally {
            setIsLoadingWithRef(false);
          }
        }
      );
    };

    const deleteUser = (userId: string) => {
      showConfirm(
        "Delete User",
        "Are you sure you want to delete this user? This action cannot be undone.",
        async () => {
          setIsLoadingWithRef(true);
          try {
            await deleteDoc(doc(db, 'users', userId));
            // Results deletion would require a query + batch delete
            
            setAllUsers((prev: any) => prev.filter((u: any) => u.id !== userId));
            
            if (currentUser?.id === userId) {
              handleLogout();
            }
            showAlert("Deleted", "User account removed successfully.");
          } catch (err: any) {
            showAlert("Error", "Failed to delete user: " + err.message);
          } finally {
            setIsLoadingWithRef(false);
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[
            { label: 'Total Users', val: users.length, icon: UserCircle, color: 'text-blue-400' },
            { label: 'Pro Users', val: users.filter((u: any) => u.subscription === 'PRO').length, icon: ShieldCheck, color: 'text-indigo-400' }
          ].map((stat, i) => (
            <div key={i} className="glass p-6 rounded-[2rem] border-white/5 flex items-center gap-4">
              <div className={cn("p-3 rounded-xl bg-white/5", stat.color)}>
                <stat.icon size={24} />
              </div>
              <div>
                <div className="text-2xl font-black tracking-tighter">{stat.val}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{stat.label}</div>
              </div>
            </div>
          ))}
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
                    <th className="px-4 pb-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user: any, index: number) => (
                    <motion.tr 
                      key={user.id} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="group"
                    >
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
                      <td className="px-4 py-4 bg-white/[0.02] rounded-r-2xl border-y border-r border-white/[0.05] text-right">
                        <div className="flex items-center justify-end gap-2">
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
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </motion.div>
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
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <Navbar />
        <Modal />
        <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
        <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>
        <main className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <Routes location={location}>
                <Route path="/" element={<Home />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={currentUser ? <Dashboard /> : <Navigate to="/auth" />} />
                <Route path="/payment" element={currentUser ? <Payment /> : <Navigate to="/auth" />} />
                <Route path="/test" element={currentUser ? <TestInterface 
                  currentTest={currentTest}
                  activeQuestionIndex={activeQuestionIndex}
                  userAnswers={userAnswers}
                  timeLeft={timeLeft}
                  setActiveQuestionIndex={setActiveQuestionIndex}
                  setUserAnswers={setUserAnswers}
                  submitTest={submitTest}
                /> : <Navigate to="/auth" />} />
                <Route path="/result" element={currentUser ? <ResultPage lastResult={lastResult} navigate={navigate} /> : <Navigate to="/auth" />} />
                <Route path="/admin" element={currentUser?.isAdmin ? <AdminPanel 
                  users={users}
                  appConfig={appConfig}
                  setAppConfig={setAppConfig}
                  setAllUsers={setAllUsers}
                  currentUser={currentUser}
                  handleLogout={handleLogout}
                  setIsLoadingWithRef={setIsLoadingWithRef}
                  showAlert={showAlert}
                  showConfirm={showConfirm}
                /> : <Navigate to="/" />} />
                <Route path="/profile" element={currentUser ? <ProfilePage /> : <Navigate to="/auth" />} />
                <Route path="/privacy" element={<PrivacyPolicy onBack={() => navigate('/')} />} />
                <Route path="/terms" element={<TermsAndConditions onBack={() => navigate('/')} />} />
                <Route path="/contact" element={<ContactUs onBack={() => navigate('/')} />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
        {isLoading && location.pathname !== '/auth' && location.pathname !== '/' && (
          <div className="fixed inset-0 z-[100] bg-slate-950/60 flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
            <div className="text-center px-6">
              <p className="font-bold text-lg">{loadingMessage}</p>
              {error && (
                <p className="text-red-400 text-sm mt-4 max-w-xs mx-auto">{error}</p>
              )}
              <div className="flex flex-col gap-2 mt-6">
                {error && (
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition-all"
                  >
                    Retry
                  </button>
                )}
                <button 
                  onClick={() => setIsLoadingWithRef(false)}
                  className="px-6 py-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10"
                >
                  Cancel / Close
                </button>
              </div>
            </div>
          </div>
        )}
        <footer className="py-12 px-6 border-t border-white/5 text-center text-slate-500 text-sm">
           <p>© 2024 TestTrail. v1.1 - All rights reserved.</p>
           <p className="mt-1">Handcrafted for future civil servants of India.</p>
           <div className="mt-4 flex justify-center gap-6">
             <Link 
               to="/privacy"
               className="hover:text-indigo-400 transition-colors font-medium"
             >
               Privacy Policy
             </Link>
             <Link 
               to="/terms"
               className="hover:text-indigo-400 transition-colors font-medium"
             >
               Terms & Conditions
             </Link>
             <Link 
               to="/contact"
               className="hover:text-indigo-400 transition-colors font-medium"
             >
               Contact Us
             </Link>
           </div>
        </footer>
      </div>
    </ErrorBoundary>
  );
};

export default App;
