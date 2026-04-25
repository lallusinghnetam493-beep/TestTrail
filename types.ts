
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export enum SubscriptionStatus {
  FREE = 'FREE',
  PENDING = 'PENDING',
  PRO = 'PRO'
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  password?: string;
  subscription: SubscriptionStatus;
  trialsUsed: number;
  isAdmin?: boolean;
  sessionId?: string;
  payment_id?: string;
  updated_at?: any;
  photoURL?: string;
}

export interface Question {
  id: number;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation?: string;
  subject?: string;
}

export interface Bookmark {
  id: string;
  userId: string;
  question: Question;
  examName: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  userId: string;
  fullName: string;
  score: number;
  testsCompleted: number;
  averagePercentage: number;
  photoURL?: string;
}

export interface TestResult {
  id: string;
  userId: string;
  examName: string;
  score: number;
  total: number;
  correct: number;
  wrong: number;
  percentage: number;
  date: string;
  questions: Question[];
  userAnswers: number[];
}

export interface AppConfig {
  upiId: string;
  subscriptionPrice: number;
}
