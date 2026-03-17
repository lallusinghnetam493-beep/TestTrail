
import React from 'react';
import { 
  Trophy, 
  Brain, 
  BarChart3, 
  Timer, 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  Power, 
  UserCircle 
} from 'lucide-react';

export const COLORS = {
  primary: '#6366f1', // Indigo 500
  secondary: '#a855f7', // Purple 500
  accent: '#3b82f6', // Blue 500
  background: '#0f172a', // Slate 900
};

export const ICONS = {
  Trophy: () => <Trophy className="w-8 h-8" />,
  Brain: () => <Brain className="w-12 h-12 text-indigo-400" />,
  Chart: () => <BarChart3 className="w-6 h-6" />,
  Timer: () => <Timer className="w-6 h-6" />,
  Check: () => <Check className="w-5 h-5" />,
  ChevronRight: () => <ChevronRight className="w-5 h-5" />,
  ChevronLeft: () => <ChevronLeft className="w-5 h-5" />,
  Power: () => <Power className="w-5 h-5" />,
  UserCircle: () => <UserCircle className="w-6 h-6" />,
};
