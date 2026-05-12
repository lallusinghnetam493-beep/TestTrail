
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  UserCircle,
  Gamepad2, 
  Share2, 
  Copy, 
  Check, 
  ArrowRight, 
  Loader2, 
  Trophy, 
  Timer, 
  X, 
  UserPlus, 
  Play, 
  LogOut,
  Target,
  Award,
  Crown,
  History,
  Zap,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  deleteDoc, 
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { User, Room, RoomScore, Question, Difficulty } from '../../types';
import { generateQuestions } from '../../services/geminiService';
import { useNavigate } from 'react-router-dom';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const generateRoomId = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Helper to format time
const formatTime = (s: number) => {
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
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
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('insufficient permissions')) {
    throw new Error("Security Error: You don't have permission to perform this action. Please check if you are logged in correctly.");
  }
  throw new Error(JSON.stringify(errInfo));
}

export const TestWithFriends: React.FC<{ currentUser: User | null }> = ({ currentUser }) => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [scores, setScores] = useState<RoomScore[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [currentAnswers, setCurrentAnswers] = useState<(number | null)[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);

  // --- Auto-join from URL ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join');
    if (joinCode && currentUser && !room) {
      handleJoinRoom(joinCode);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [currentUser]);

  // --- Real-time Sync ---
  useEffect(() => {
    if (!room?.id) return;

    console.log("Setting up room listeners for:", room.id);

    // Sync room state
    const unsubRoom = onSnapshot(doc(db, 'rooms', room.id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as any;
        console.log("Room Snapshot Update:", data.status, "gameStarted:", data.gameStarted);

        let parsedQuestions: Question[] = [];
        try {
          parsedQuestions = typeof data.questions === 'string' ? JSON.parse(data.questions) : data.questions;
        } catch (e) {
          console.error("Failed to parse questions", e);
        }

        setRoom(prev => {
          // Deep compare or just merge carefully to avoid losing questions array if snapshot is partial (though it shouldn't be)
          return {
            ...data,
            id: docSnap.id,
            questions: parsedQuestions || prev?.questions || []
          };
        });
        setTimeLeft(data.timer);
      } else {
        console.log("Room deleted or doesn't exist");
        setRoom(null);
        setError("Room was closed by host.");
      }
    }, (err) => {
      console.error("Room Snapshot Error:", err);
      handleFirestoreError(err, OperationType.GET, `rooms/${room.id}`);
    });

    // Sync scores
    const qScores = query(collection(db, 'scores'), where('roomId', '==', room.id));
    const unsubScores = onSnapshot(qScores, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RoomScore[];
      console.log("Scores Snapshot Update:", data.length, "players");
      setScores(data.sort((a, b) => b.score - a.score));
    }, (err) => {
      console.error("Scores Snapshot Error:", err);
    });

    return () => {
      console.log("Cleaning up room listeners for:", room.id);
      unsubRoom();
      unsubScores();
    };
  }, [room?.id]); // Only depend on ID to prevent recreation loops

  // Heartbeat separately
  useEffect(() => {
    if (!currentUser || !room?.id) return;

    const heartbeat = setInterval(async () => {
      try {
        const scoreId = `${room.id}_${currentUser.id}`;
        await updateDoc(doc(db, 'scores', scoreId), {
          lastActive: serverTimestamp()
        });
      } catch (err) {
        console.warn("Heartbeat failed:", err);
      }
    }, 10000);

    return () => clearInterval(heartbeat);
  }, [currentUser?.id, room?.id]);

  // --- Actions ---
  const handleCreateRoom = async (topic: string, settings: any) => {
    if (!currentUser) return;
    setIsLoading(true);
    setError(null);
    try {
      console.log("Creating room for topic:", topic);
      // Status update for UI
      setError("Generating questions with AI..."); 
      const questions = await generateQuestions(topic, settings.questionCount, settings.language, settings.difficulty);
      setError(null); // Clear the message
      
      const newRoomId = generateRoomId();
      console.log("Questions generated, Room ID:", newRoomId);
      
      const roomData = {
        id: newRoomId,
        hostId: currentUser.id,
        status: 'waiting',
        topic,
        questions, 
        currentQuestion: null,
        currentQuestionIndex: 0,
        gameStarted: false,
        timer: settings.timePerQuestion,
        players: [currentUser.id],
        createdAt: serverTimestamp(),
        settings: {
          category: settings.category || 'General',
          difficulty: settings.difficulty,
          language: settings.language,
          questionCount: settings.questionCount,
          timePerQuestion: settings.timePerQuestion,
          maxPlayers: settings.maxPlayers
        }
      };

      try {
        await setDoc(doc(db, 'rooms', newRoomId), roomData);
        console.log("Room doc created successfully");
      } catch (err: any) {
        console.error("Room doc creation failed:", err);
        if (err.message.includes('insufficient permissions')) {
           setError("Permission denied when creating room. Rules might be too strict.");
        } else {
           handleFirestoreError(err, OperationType.CREATE, `rooms/${newRoomId}`);
        }
        return; // Stop here if room creation fails
      }

      // Create host's score entry
      const scoreId = `${newRoomId}_${currentUser.id}`;
      try {
        await setDoc(doc(db, 'scores', scoreId), {
          id: scoreId,
          roomId: newRoomId,
          playerId: currentUser.id,
          playerName: currentUser.fullName,
          photoURL: currentUser.photoURL || null,
          score: 0,
          answers: new Array(questions.length).fill(null),
          isReady: true,
          lastActive: serverTimestamp(),
          isHost: true
        });
        console.log("Host score entry created successfully");
      } catch (err: any) {
        console.error("Score entry creation failed:", err);
        if (err.message.includes('insufficient permissions')) {
          setError("Permission denied when creating score entry.");
        } else {
          handleFirestoreError(err, OperationType.CREATE, `scores/${scoreId}`);
        }
        return;
      }

      setRoom({ ...roomData, questions, id: newRoomId } as Room);
      setCurrentAnswers(new Array(questions.length).fill(null));
    } catch (err: any) {
      console.error("Create room error:", err);
      setError(err.message || "Failed to create room.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinRoom = async (code: string) => {
    if (!currentUser) return;
    setIsLoading(true);
    setError(null);
    const upperCode = code.toUpperCase();
    try {
      console.log("Joining room:", upperCode);
      const roomSnap = await getDoc(doc(db, 'rooms', upperCode));
      if (!roomSnap.exists()) throw new Error("Invalid room code.");
      
      const roomData = roomSnap.data();
      if (roomData.status !== 'waiting') throw new Error("Room has already started.");
      const maxPlayers = roomData.settings?.maxPlayers || 10;
      if (roomData.players.length >= maxPlayers) throw new Error(`Room is full (max ${maxPlayers} players).`);
      
      const questions = typeof roomData.questions === 'string' ? JSON.parse(roomData.questions) : roomData.questions;

      if (!roomData.players.includes(currentUser.id)) {
        try {
          await updateDoc(doc(db, 'rooms', upperCode), {
            players: arrayUnion(currentUser.id)
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `rooms/${upperCode}`);
        }
      }

      const scoreId = `${upperCode}_${currentUser.id}`;
      try {
        await setDoc(doc(db, 'scores', scoreId), {
          id: scoreId,
          roomId: upperCode,
          playerId: currentUser.id,
          playerName: currentUser.fullName,
          photoURL: currentUser.photoURL || null,
          score: 0,
          answers: new Array(questions.length).fill(null),
          isReady: true,
          lastActive: serverTimestamp(),
          isHost: false
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `scores/${scoreId}`);
      }

      setRoom({ ...roomData, id: upperCode, questions } as Room);
      setCurrentAnswers(new Array(questions.length).fill(null));
    } catch (err: any) {
      console.error("Join room error:", err);
      setError(err.message || "Failed to join room.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartTest = async () => {
    if (!room || room.hostId !== currentUser?.id) return;
    
    console.log("Starting test for room:", room.id);
    if (!room.questions || room.questions.length === 0) {
      setError("Questions not loaded. Please wait.");
      return;
    }

    try {
      const firstQuestion = room.questions[0];
      await updateDoc(doc(db, 'rooms', room.id), {
        status: 'playing',
        gameStarted: true,
        currentQuestionIndex: 0,
        currentQuestion: firstQuestion,
        timer: room.settings.timePerQuestion
      });
      console.log("Room updated to status: playing with first question");
    } catch (err) {
      console.error("Start test error:", err);
      setError("Failed to start test. Check permissions.");
    }
  };

  const handleKickPlayer = async (playerId: string) => {
    if (!room || room.hostId !== currentUser?.id) return;
    try {
      await updateDoc(doc(db, 'rooms', room.id), {
        players: arrayRemove(playerId)
      });
      await deleteDoc(doc(db, 'scores', `${room.id}_${playerId}`));
    } catch (err) {
      console.error("Kick player error:", err);
    }
  };

  const handleEndRoom = async () => {
    if (!room || room.hostId !== currentUser?.id) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'rooms', room.id));
      scores.forEach(s => {
        batch.delete(doc(db, 'scores', `${room.id}_${s.playerId}`));
      });
      await batch.commit();
      setRoom(null);
    } catch (err) {
      console.error("End room error:", err);
    }
  };

  const handleAnswer = async (questionIndex: number, answerIndex: number) => {
    if (!room || !currentUser || room.status !== 'playing') return;
    
    try {
      const isCorrect = room.questions[questionIndex].correctAnswerIndex === answerIndex;
      const newAnswers = [...currentAnswers];
      newAnswers[questionIndex] = answerIndex;
      setCurrentAnswers(newAnswers);

      const scoreId = `${room.id}_${currentUser.id}`;
      const currentScoreDoc = await getDoc(doc(db, 'scores', scoreId));
      const currentScore = currentScoreDoc.data()?.score || 0;

      await updateDoc(doc(db, 'scores', scoreId), {
        score: isCorrect ? currentScore + 10 : currentScore,
        answers: newAnswers
      });
    } catch (err) {
      console.error("Handle answer error:", err);
    }
  };

  const handleLeave = async () => {
    if (!room || !currentUser) return;
    try {
      if (room.hostId === currentUser.id) {
        await handleEndRoom();
      } else {
        await updateDoc(doc(db, 'rooms', room.id), {
          players: arrayRemove(currentUser.id)
        });
        await deleteDoc(doc(db, 'scores', `${room.id}_${currentUser.id}`));
        setRoom(null);
      }
    } catch (err) {
      console.error("Leave room error:", err);
    }
  };

  // --- Real-time Timer Sync for Host ---
  useEffect(() => {
    if (!room || room.status !== 'playing' || room.hostId !== currentUser?.id) return;

    const interval = setInterval(async () => {
      const roomRef = doc(db, 'rooms', room.id);
      
      // Check if everyone has answered the current question
      const currentIdx = room.currentQuestionIndex;
      const roomScores = scores.filter(s => room.players.includes(s.playerId));
      const everyoneAnswered = roomScores.length > 0 && roomScores.every(s => s.answers[currentIdx] !== null);

      if (room.timer > 0 && !everyoneAnswered) {
        await updateDoc(roomRef, {
          timer: room.timer - 1
        });
      } else {
        // Time's up or everyone answered
        console.log(everyoneAnswered ? "Everyone answered!" : "Time up!", "for question", room.currentQuestionIndex);
        const nextIndex = room.currentQuestionIndex + 1;
        if (nextIndex < room.questions.length) {
          console.log("Moving to next question:", nextIndex);
          await updateDoc(roomRef, {
            currentQuestionIndex: nextIndex,
            currentQuestion: room.questions[nextIndex],
            timer: room.settings.timePerQuestion
          });
        } else {
          console.log("All questions finished");
          await updateDoc(roomRef, {
            status: 'finished',
            gameStarted: false
          });
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room?.status, room?.timer, room?.currentQuestionIndex, room?.hostId, room?.id, room?.questions, room?.players, scores]);


  // --- UI Screens ---
  if (!room) {
    return <MultiplayerDashboard onJoin={handleJoinRoom} onCreate={handleCreateRoom} isLoading={isLoading} error={error} />;
  }

  if (room.status === 'waiting') {
    return (
      <RoomLobby 
        room={room} 
        scores={scores} 
        currentUser={currentUser} 
        onStart={handleStartTest} 
        onKick={handleKickPlayer} 
        onLeave={handleLeave}
        onEnd={handleEndRoom}
      />
    );
  }

  if (room.status === 'playing') {
    return (
      <MultiplayerQuiz 
        room={room} 
        scores={scores} 
        currentUser={currentUser} 
        timeLeft={timeLeft} 
        currentAnswers={currentAnswers}
        onAnswer={handleAnswer} 
      />
    );
  }

  if (room.status === 'finished') {
    return (
      <MultiplayerResults 
        room={room} 
        scores={scores} 
        currentUser={currentUser} 
        onLeave={handleLeave} 
        onReplay={() => handleCreateRoom(room.topic, room.settings)}
      />
    );
  }

  return null;
};

// --- Sub-components ---

const MultiplayerDashboard = ({ onJoin, onCreate, isLoading, error }: any) => {
  const [code, setCode] = useState('');
  const [topic, setTopic] = useState('');
  const [settings, setSettings] = useState({
    timePerQuestion: 120,
    difficulty: 'Medium' as Difficulty,
    language: 'English',
    questionCount: 10,
    maxPlayers: 5
  });

  return (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto space-y-12">
      <div className="text-center space-y-4">
        <h2 className="text-5xl font-black tracking-tight text-white">Test With <span className="gradient-text">Friends</span> 🔥</h2>
        <p className="text-slate-400 font-medium text-lg">Challenge your friends in real-time competitive tests.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Join Room */}
        <div className="glass p-10 rounded-[3rem] space-y-8 border-indigo-500/10">
          <div className="space-y-2">
             <div className="w-12 h-12 bg-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                <Users size={24} />
             </div>
             <h3 className="text-2xl font-black text-white">Join Room</h3>
             <p className="text-sm text-slate-500">Enter the room code shared by your friend.</p>
          </div>
          
          <div className="space-y-4">
             <input 
               type="text" 
               value={code} 
               onChange={e => setCode(e.target.value.toUpperCase())}
               placeholder="ROOM CODE" 
               className="w-full p-5 bg-white/5 border border-white/10 rounded-2xl text-center text-3xl font-black tracking-[0.5em] focus:border-indigo-500 transition-all uppercase placeholder:text-slate-700"
             />
             <button 
               onClick={() => onJoin(code)}
               disabled={isLoading || !code}
               className="w-full py-5 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-black text-white shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 disabled:opacity-50 transition-all active:scale-95"
             >
               {isLoading ? <Loader2 className="animate-spin" /> : <Gamepad2 size={24} />}
               Join Now
             </button>
          </div>
        </div>

        {/* Create Room */}
        <div className="glass p-10 rounded-[3rem] space-y-8 border-purple-500/10">
          <div className="space-y-2">
             <div className="w-12 h-12 bg-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400 border border-purple-500/20">
                <UserPlus size={24} />
             </div>
             <h3 className="text-2xl font-black text-white">Create Room</h3>
             <p className="text-sm text-slate-500">Pick a topic and host your own competitive room.</p>
          </div>

          <div className="space-y-6">
             <input 
               type="text" 
               value={topic} 
               onChange={e => setTopic(e.target.value)}
               placeholder="Topic (e.g. UPSC Prelims)" 
               className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl font-bold focus:border-purple-500 transition-all"
             />
             
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Language</label>
                    <select 
                      value={settings.language}
                      onChange={e => setSettings({...settings, language: e.target.value})}
                      className="w-full p-3 bg-white/5 border border-white/10 rounded-xl font-bold text-sm"
                    >
                      <option value="English">English</option>
                      <option value="Hindi">Hindi</option>
                    </select>
                 </div>
                 <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Questions</label>
                   <select 
                     value={settings.questionCount}
                     onChange={e => setSettings({...settings, questionCount: Number(e.target.value)})}
                     className="w-full p-3 bg-white/5 border border-white/10 rounded-xl font-bold text-sm"
                   >
                     <option value={10}>10 Qs</option>
                     <option value={20}>20 Qs</option>
                     <option value={50}>50 Qs</option>
                   </select>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest ml-2">Slot Limit</label>
                   <select 
                     value={settings.maxPlayers}
                     onChange={e => setSettings({...settings, maxPlayers: Number(e.target.value)})}
                     className="w-full p-3 bg-white/5 border border-white/10 rounded-xl font-bold text-sm"
                   >
                     <option value={2}>2 Players</option>
                     <option value={3}>3 Players</option>
                     <option value={4}>4 Players</option>
                     <option value={5}>5 Players</option>
                     <option value={8}>8 Players</option>
                     <option value={10}>10 Players</option>
                     <option value={20}>20 Players</option>
                   </select>
                </div>
             </div>

             <button 
               onClick={() => onCreate(topic, settings)}
               disabled={isLoading || !topic}
               className="w-full py-5 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl font-black text-white shadow-xl shadow-purple-500/20 flex items-center justify-center gap-3 disabled:opacity-50 transition-all active:scale-95"
             >
               {isLoading ? <Loader2 className="animate-spin" /> : <Play size={24} />}
               Host Room
             </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400"
          >
            <AlertCircle size={20} />
            <span className="font-bold text-sm">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const RoomLobby = ({ room, scores, currentUser, onStart, onKick, onLeave, onEnd }: any) => {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === currentUser?.id;

  const activePlayers = useMemo(() => {
    const now = Date.now();
    return scores.filter((s: any) => {
      if (!s.lastActive) return true; // Just joined
      const lastActive = s.lastActive.toMillis ? s.lastActive.toMillis() : new Date(s.lastActive).getTime();
      return now - lastActive < 60000; // 60 seconds threshold
    });
  }, [scores]);

  const copyCode = () => {
    navigator.clipboard.writeText(room.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto space-y-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
           <div className="flex items-center gap-2 text-indigo-400 text-xs font-black uppercase tracking-widest">
              <History size={14} /> Waiting Lobby
           </div>
           <h2 className="text-4xl font-black text-white">{room.topic}</h2>
           <p className="text-slate-400 font-medium">{scores.length} Players joined</p>
        </div>

        <div className="flex gap-3">
           <div className="glass px-6 py-4 rounded-2xl border-white/10 flex flex-col items-center">
              <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Room Code</span>
              <div className="flex items-center gap-3">
                 <span className="text-2xl font-black text-white tracking-widest">{room.id}</span>
                 <button onClick={copyCode} className="p-2 hover:bg-white/5 rounded-lg text-indigo-400 transition-all active:scale-90">
                    {copied ? <Check size={20} /> : <Copy size={20} />}
                 </button>
              </div>
           </div>
           <button onClick={() => {
              const url = window.location.origin + '/multiplayer?join=' + room.id;
              navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
           }} className="glass px-6 py-4 rounded-2xl border-white/10 hover:bg-white/5 transition-all text-slate-400 font-bold flex flex-col items-center justify-center gap-1">
              <Share2 size={24} />
              <span className="text-[9px] uppercase font-black">Invite</span>
           </button>
        </div>
      </div>

      <div className="glass p-8 rounded-[3rem] space-y-8 border-white/5">
         <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {activePlayers.map((player: RoomScore) => (
               <motion.div 
                 key={player.id} 
                 initial={{ scale: 0.8, opacity: 0 }}
                 animate={{ scale: 1, opacity: 1 }}
                 className="flex flex-col items-center space-y-3 relative group"
               >
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white/10 shadow-2xl relative">
                       {player.photoURL ? (
                          <img src={player.photoURL} alt={player.playerName} className="w-full h-full object-cover" />
                       ) : (
                          <div className="w-full h-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                             <UserCircle size={40} />
                          </div>
                       )}
                    </div>
                    {player.isHost && (
                      <div className="absolute -top-2 -right-2 bg-yellow-500 text-black p-1.5 rounded-full shadow-lg border-2 border-slate-950">
                         <Crown size={14} />
                      </div>
                    )}
                  </div>
                  <div className="text-center space-y-0.5">
                    <p className="font-bold text-white text-sm truncate max-w-[100px]">{player.playerName}</p>
                    <p className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">{player.isHost ? 'Host' : 'Ready'}</p>
                  </div>

                  {isHost && !player.isHost && (
                    <button 
                      onClick={() => onKick(player.playerId)}
                      className="absolute -top-2 -left-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 active:scale-95"
                    >
                      <X size={14} />
                    </button>
                  )}
               </motion.div>
            ))}

            {Array.from({ length: Math.max(0, 5 - scores.length) }).map((_, i) => (
               <div key={i} className="flex flex-col items-center space-y-3 opacity-20">
                  <div className="w-20 h-20 rounded-full border-4 border-dashed border-white/20 flex items-center justify-center text-slate-500">
                     <Users size={32} />
                  </div>
                  <div className="w-16 h-2 bg-white/10 rounded-full"></div>
               </div>
            ))}
         </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
         {isHost ? (
            <>
               <button 
                 onClick={onEnd}
                 className="px-8 py-5 glass border-red-500/20 text-red-400 rounded-2xl font-black hover:bg-red-500/5 transition-all flex items-center justify-center gap-3"
               >
                 <LogOut size={20} /> Close Room
               </button>
               <button 
                 onClick={onStart}
                 disabled={scores.length < 1}
                 className="flex-1 py-5 bg-indigo-500 hover:bg-indigo-600 rounded-2xl font-black text-white text-xl shadow-2xl shadow-indigo-500/30 flex items-center justify-center gap-4 transition-all active:scale-[0.98] disabled:opacity-50"
               >
                 <Zap size={24} className="fill-white" /> Start Live Test
               </button>
            </>
         ) : (
            <button 
               onClick={onLeave}
               className="w-full py-5 glass border-white/10 text-slate-400 rounded-2xl font-black hover:bg-white/5 transition-all flex items-center justify-center gap-3"
            >
               <LogOut size={20} /> Leave Room
            </button>
         )}
      </div>
    </div>
  );
};

const MultiplayerQuiz = ({ room, scores, currentUser, timeLeft, currentAnswers, onAnswer }: any) => {
  const currentQ = room.currentQuestion || (room.questions && room.questions[room.currentQuestionIndex]);
  const selectedIdx = currentAnswers[room.currentQuestionIndex];

  useEffect(() => {
    console.log("MultiplayerQuiz Rendered. Current Q Index:", room.currentQuestionIndex, "Has currentQ:", !!currentQ);
  }, [room.currentQuestionIndex, !!currentQ]);

  if (!currentQ) {
    console.warn("No current question found. Room state:", {
      gameStarted: room.gameStarted,
      status: room.status,
      index: room.currentQuestionIndex,
      hasQuestions: !!room.questions,
      questionsLen: room.questions?.length
    });
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-white space-y-4">
        <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
        <p className="font-bold text-xl">Waiting for question synchronization...</p>
        <p className="text-sm text-slate-500">Host is preparing the next question.</p>
      </div>
    );
  }
  
  return (
    <div className="pt-24 pb-12 px-6 min-h-screen flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
      {/* Quiz Area */}
      <div className="flex-1 space-y-8">
        <div className="flex justify-between items-center glass p-6 rounded-3xl border-white/5">
           <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Live Room</span>
              <h3 className="text-2xl font-black text-white">{room.topic}</h3>
           </div>
           
           <div className="flex items-center gap-6">
              <div className="flex flex-col items-center">
                 <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">Time Left</span>
                 <div className={cn(
                   "text-3xl font-black tabular-nums transition-colors",
                   timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"
                 )}>
                   {timeLeft}s
                 </div>
              </div>
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                 <div className="text-center">
                    <div className="text-[10px] font-black text-indigo-400">Q</div>
                    <div className="text-xl font-black text-white">{room.currentQuestionIndex + 1}/{room.questions.length}</div>
                 </div>
              </div>
           </div>
        </div>

        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
           <motion.div 
             animate={{ width: `${(timeLeft / room.settings.timePerQuestion) * 100}%` }}
             className={cn(
                "h-full transition-all",
                timeLeft <= 10 ? "bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]" : "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
             )}
           />
        </div>

        <AnimatePresence mode="wait">
          <motion.div 
            key={room.currentQuestionIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="glass p-10 rounded-[3rem] space-y-10 shadow-2xl border-white/5"
          >
            <h2 className="text-3xl font-bold leading-relaxed text-white">{currentQ.text}</h2>
            
            <div className="grid grid-cols-1 gap-4">
               {currentQ.options.map((opt: string, idx: number) => (
                 <button 
                    key={idx}
                    onClick={() => onAnswer(room.currentQuestionIndex, idx)}
                    disabled={selectedIdx !== null}
                    className={cn(
                      "w-full p-6 text-left rounded-2xl border transition-all flex items-center justify-between group",
                      selectedIdx === idx ? "bg-indigo-500/20 border-indigo-500 text-white" : 
                      selectedIdx !== null ? "bg-white/5 border-white/5 text-slate-600 cursor-default" :
                      "bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/30 hover:bg-white/5"
                    )}
                 >
                    <div className="flex items-center gap-5">
                       <div className={cn(
                         "w-10 h-10 rounded-xl flex items-center justify-center font-black border transition-all",
                         selectedIdx === idx ? "bg-indigo-500 border-indigo-400 text-white" : "bg-white/5 border-white/10"
                       )}>
                          {String.fromCharCode(65 + idx)}
                       </div>
                       <span className="text-lg font-bold">{opt}</span>
                    </div>
                    {selectedIdx === idx && <CheckCircle2 size={24} className="text-indigo-400" />}
                 </button>
               ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sidebar Leaderboard */}
      <div className="w-full lg:w-80 space-y-6">
         <div className="glass p-8 rounded-[3rem] border-white/5 h-full flex flex-col">
            <h4 className="text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-6 flex items-center gap-2">
              <Award size={16} /> Live Ranking
            </h4>
            
            <div className="flex-1 space-y-4">
               {scores.map((player: RoomScore, idx: number) => (
                  <motion.div 
                    layout
                    key={player.id} 
                    className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border transition-all",
                      player.playerId === currentUser?.id ? "bg-indigo-500/10 border-indigo-500/30" : "bg-white/[0.02] border-white/5"
                    )}
                  >
                     <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0",
                          idx === 0 ? "bg-yellow-500 text-black" : "bg-white/5 text-slate-500"
                        )}>
                           {idx + 1}
                        </div>
                        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0">
                           {player.photoURL ? <img src={player.photoURL} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800" />}
                        </div>
                        <span className="font-bold text-sm text-white truncate max-w-[80px]">{player.playerName}</span>
                     </div>
                     <span className="font-black text-indigo-400">{player.score}</span>
                  </motion.div>
               ))}
            </div>

            <div className="pt-6 border-t border-white/5 mt-6">
               <div className="p-4 bg-indigo-500/5 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase text-indigo-400 tracking-widest">
                     <TrendingUp size={12} /> Status
                  </div>
                  <p className="text-xs text-slate-400 font-medium">
                    {selectedIdx !== null ? "Answer locked. Waiting for others..." : "Hurry up! Tick tock..."}
                  </p>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

const MultiplayerResults = ({ room, scores, currentUser, onLeave, onReplay }: any) => {
  const winner = scores[0];
  const isWinner = winner?.playerId === currentUser?.id;
  const userScore = scores.find((s: any) => s.playerId === currentUser?.id);

  return (
    <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto space-y-12">
      <div className="text-center space-y-6">
         <motion.div 
           initial={{ scale: 0, rotate: -20 }}
           animate={{ scale: 1, rotate: 0 }}
           className="w-32 h-32 bg-yellow-500/20 rounded-full mx-auto flex items-center justify-center text-yellow-500 shadow-[0_0_50px_rgba(234,179,8,0.3)] relative"
         >
            <Trophy size={64} />
            <motion.div 
               animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
               transition={{ repeat: Infinity, duration: 2 }}
               className="absolute -top-2 -right-2 bg-indigo-600 text-white p-2 rounded-full border-4 border-slate-950"
            >
               <Crown size={24} />
            </motion.div>
         </motion.div>
         
         <div className="space-y-2">
            <h2 className="text-5xl font-black tracking-tight text-white uppercase italic">
              {isWinner ? "Victory is Yours!" : "Game Over!"}
            </h2>
            <p className="text-slate-400 text-lg font-medium">
               The crown belongs to <span className="text-yellow-500 font-black">{winner?.playerName}</span>
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         <div className="glass p-10 rounded-[3rem] space-y-8 border-white/5 order-2 md:order-1">
            <h3 className="text-2xl font-black text-white flex items-center gap-3">
               <Award size={24} className="text-indigo-400" /> Final Standing
            </h3>
            
            <div className="space-y-4">
               {scores.map((player: RoomScore, idx: number) => (
                  <motion.div 
                    key={player.id} 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.1 }}
                    className={cn(
                      "flex items-center justify-between p-5 rounded-[2rem] border transition-all",
                      idx === 0 ? "bg-yellow-500/10 border-yellow-500/30 scale-[1.05]" : 
                      player.playerId === currentUser?.id ? "bg-indigo-500/10 border-indigo-500/30" : "bg-white/[0.02] border-white/5"
                    )}
                  >
                     <div className="flex items-center gap-5">
                        <span className={cn(
                           "text-2xl font-black italic",
                           idx === 0 ? "text-yellow-500" : "text-slate-700"
                        )}>#{idx + 1}</span>
                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/10">
                           {player.photoURL ? <img src={player.photoURL} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-800" />}
                        </div>
                        <div>
                           <div className="font-black text-white">{player.playerName}</div>
                           <div className="text-[10px] uppercase font-black tracking-widest text-slate-500">{player.isHost ? 'Host' : 'Aspirant'}</div>
                        </div>
                     </div>
                     <div className="text-right">
                        <div className="text-2xl font-black text-white">{player.score}</div>
                        <div className="text-[10px] font-black uppercase text-indigo-400">Points</div>
                     </div>
                  </motion.div>
               ))}
            </div>
         </div>

         <div className="flex flex-col gap-6 order-1 md:order-2">
            <div className="glass p-10 rounded-[3rem] border-white/5 space-y-8">
               <h3 className="text-2xl font-black text-white">Your Stats</h3>
               <div className="grid grid-cols-2 gap-4">
                  <div className="p-6 bg-white/[0.02] rounded-[2rem] border border-white/5 flex flex-col items-center justify-center">
                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Rank</span>
                     <div className="text-4xl font-black text-indigo-400">#{scores.findIndex((s: any) => s.playerId === currentUser?.id) + 1}</div>
                  </div>
                  <div className="p-6 bg-white/[0.02] rounded-[2rem] border border-white/5 flex flex-col items-center justify-center">
                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Score</span>
                     <div className="text-4xl font-black text-indigo-400">{userScore?.score || 0}</div>
                  </div>
               </div>
               
               <div className="space-y-4 pt-4 border-t border-white/5">
                  <div className="flex justify-between items-center px-2">
                     <span className="text-sm font-bold text-slate-400">Accuracy</span>
                     <span className="text-sm font-black text-white">
                        {((userScore?.score || 0) / (room.questions.length * 10) * 100).toFixed(0)}%
                     </span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${((userScore?.score || 0) / (room.questions.length * 10)) * 100}%` }}
                        className="h-full bg-indigo-500"
                     />
                  </div>
               </div>
            </div>

            <div className="flex flex-col gap-4">
               {room.hostId === currentUser?.id && (
                  <button 
                     onClick={onReplay}
                     className="w-full py-6 bg-indigo-500 hover:bg-indigo-600 rounded-[2rem] font-black text-xl text-white shadow-2xl shadow-indigo-500/30 flex items-center justify-center gap-4 transition-all active:scale-[0.98]"
                   >
                     <Zap size={24} /> New Challenge
                   </button>
               )}
               <button 
                  onClick={onLeave}
                  className="w-full py-6 glass hover:bg-white/5 rounded-[2rem] font-black text-lg text-slate-400 flex items-center justify-center gap-4 transition-all"
               >
                  <ArrowRight size={20} /> Back to Dashboard
               </button>
            </div>
         </div>
      </div>
    </div>
  );
};
