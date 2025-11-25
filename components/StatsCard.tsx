import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  amount: number;
  icon: LucideIcon;
  iconColor?: string;
  amountColor?: string;
  gradientFrom?: string;
  gradientTo?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  amount,
  icon: Icon,
  iconColor = 'text-cyan-400',
  amountColor = 'text-white',
  gradientFrom = 'from-purple-500',
  gradientTo = 'to-cyan-500'
}) => {
  return (
    <div className="glass-strong rounded-2xl p-6 hover-lift group relative overflow-hidden border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${gradientFrom} ${gradientTo} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
          <Icon size={28} className="text-white" />
        </div>
        <div className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
          <span className="text-sm font-normal mr-1" style={{ color: 'var(--text-secondary)' }}>PKR</span>
          {amount.toLocaleString()}
        </div>
      </div>
      <p className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{title}</p>
      <div className="mt-3 h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent rounded-full"></div>
    </div>
  );
};