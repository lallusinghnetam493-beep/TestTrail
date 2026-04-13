
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
  utr?: string;
  isAdmin?: boolean;
  sessionId?: string;
  subscriptionExpiresAt?: number;
  razorpayPaymentId?: string;
}

export interface Question {
  id: number;
  text: string;
  options: string[];
  correctAnswerIndex: number;
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
