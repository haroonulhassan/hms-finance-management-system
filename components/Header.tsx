import React, { useState } from 'react';
import { LogOut, Settings, Bell, Menu, Sun, Moon } from 'lucide-react';
import { User, UserRole } from '../types';

interface HeaderProps {
  user: User;
  onLogout: () => void;
  onOpenSettings?: () => void;
  onOpenRequests?: () => void;
  notificationCount?: number;
  onSwitchRole?: (role: UserRole) => void;
  testingMode?: boolean;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onLogout,
  onOpenSettings,
  onOpenRequests,
  notificationCount = 0,
  onSwitchRole,
  testingMode = false,
  theme = 'dark',
  onToggleTheme
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <header className="glass-strong border-b border-white/10 sticky top-0 z-50 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center overflow-hidden shadow-lg">
              {imgError ? (
                <span className="text-sm font-bold text-white">HMS</span>
              ) : (
                <img
                  src="https://drive.google.com/thumbnail?id=1CjfPyJTGK_HWGqORXdEbTvEHUl4dZR7i&sz=w200"
                  alt="HMS"
                  className="w-full h-full object-contain"
                  onError={() => setImgError(true)}
                />
              )}
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-gradient-primary">
                HMS Finance
              </h1>
              <p className="text-xs text-slate-400 -mt-1">Management System</p>
            </div>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* Admin Role Switcher */}
            {user?.originalRole === 'admin' && testingMode && (
              <div className="glass px-3 py-1.5 rounded-lg border-2 border-cyan-400/50 shadow-lg">
                <select
                  value={user.role}
                  onChange={(e) => onSwitchRole && onSwitchRole(e.target.value as UserRole)}
                  className="bg-transparent text-xs font-bold focus:outline-none cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <option value="admin" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Admin</option>
                  <option value="assistant" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">Assistant</option>
                  <option value="user" className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">User</option>
                </select>
              </div>
            )}

            {/* Welcome Text */}
            <div className="hidden md:flex items-center gap-2 glass px-4 py-2 rounded-lg">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-sm">
                <p className="text-slate-200 font-semibold">{user?.username || 'User'}</p>
                <p className="text-xs text-slate-400 capitalize">{user?.role}</p>
              </div>
            </div>

            {/* Admin Actions */}
            {user?.role === 'admin' && (
              <>
                {onOpenRequests && (
                  <button
                    onClick={onOpenRequests}
                    className="relative glass hover:bg-white/10 p-2.5 rounded-lg transition-all hover-glow"
                    title="Pending Requests"
                  >
                    <Bell size={20} className="text-slate-200" />
                    {notificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-gradient-to-r from-pink-500 to-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg animate-pulse-glow">
                        {notificationCount}
                      </span>
                    )}
                  </button>
                )}
                {onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    className="glass hover:bg-white/10 p-2.5 rounded-lg transition-all hover-glow"
                    title="Settings"
                  >
                    <Settings size={20} className="text-slate-200" />
                  </button>
                )}
              </>
            )}

            {/* Logout Button */}
            {onToggleTheme && (
              <button
                onClick={onToggleTheme}
                className="glass hover:bg-white/10 p-2.5 rounded-lg transition-all hover-glow"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-purple-500" />}
              </button>
            )}

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="btn-danger px-4 py-2 rounded-lg flex items-center gap-2 font-semibold text-sm"
              title="Logout"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};