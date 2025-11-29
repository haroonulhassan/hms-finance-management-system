
import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { authenticate, resetAdminPassword, getPublicCredentials, verifyBackupCode } from '../services/db';
import { Eye, EyeOff, X, Sparkles } from 'lucide-react';

interface LoginProps {
  onLogin: (user: User, token: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [role, setRole] = useState<UserRole>('admin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password Modal State
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [backupCode, setBackupCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');

  const [adminHint, setAdminHint] = useState('');

  useEffect(() => {
    const fetchHint = async () => {
      const creds = await getPublicCredentials();
      setAdminHint(creds.adminUsername);
    };
    fetchHint();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username || !password) {
      setError('Please fill in all fields');
      setLoading(false);
      return;
    }

    try {
      const result = await authenticate(username, password);
      if (result.success && result.role && result.token) {
        if (result.role !== role) {
          setError(`Invalid credentials`);
        } else {
          onLogin({
            username: result.username || username,
            role: result.role,
            originalRole: result.role === 'admin' ? 'admin' : undefined
          }, result.token);
        }
      } else {
        setError(result.error || 'Invalid username or password');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotVerify = async () => {
    setForgotError('');
    if (!backupCode) {
      setForgotError('Please enter a backup code');
      return;
    }

    const isValid = await verifyBackupCode(backupCode);
    if (isValid) {
      setForgotStep(2);
    } else {
      setForgotError('Invalid backup code');
    }
  };

  const handleForgotSubmit = async () => {
    if (!newPassword) {
      setForgotError('Please enter a new password');
      return;
    }

    const result = await resetAdminPassword(backupCode, newPassword);
    if (result.success) {
      // A new unique backup code is generated after password reset
      setForgotSuccess('✅ Password reset successfully! A new backup code has been sent to your email.');
      setTimeout(() => {
        setShowForgot(false);
        setForgotSuccess('');
        setForgotStep(1);
        setBackupCode('');
        setNewPassword('');
      }, 3000);
    } else {
      setForgotError('Failed to reset password. Please try again.');
    }
  };

  const handleRequestBackupCodes = async () => {
    setForgotError('');
    setForgotSuccess('');
    try {
      const response = await fetch(`http://localhost:5000/api/send-backup-codes`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        setForgotSuccess('✅ Backup code sent to hmsfinance.management@gmail.com! Check your inbox.');
        // Auto-clear success message after 2 seconds
        setTimeout(() => {
          setForgotSuccess('');
        }, 2000);
      } else {
        setForgotError(data.error || 'Failed to send backup code');
      }
    } catch (error) {
      setForgotError('Network error. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-mesh p-4 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-float"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-cyan-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute -bottom-8 left-1/2 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-float" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="glass-strong p-8 rounded-3xl shadow-2xl w-full max-w-[460px] relative z-10">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 mb-4 flex items-center justify-center shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-cyan-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            {imgError ? (
              <span className="text-3xl font-bold text-white relative z-10">HMS</span>
            ) : (
              <img
                src="https://drive.google.com/thumbnail?id=1CjfPyJTGK_HWGqORXdEbTvEHUl4dZR7i&sz=w1000"
                alt="HMS Logo"
                className="w-full h-full object-contain relative z-10"
                onError={() => setImgError(true)}
              />
            )}
          </div>
          <h2 className="text-3xl font-bold text-center text-gradient-primary mb-2">
            HMS Finance
          </h2>
          <p className="text-slate-300 text-sm font-medium flex items-center gap-2">
            <Sparkles size={14} className="text-cyan-400" />
            Hayatian's Mathematical Society
          </p>
        </div>

        {/* Role Selector */}
        <div className="flex gap-2 mb-6">
          {(['admin', 'assistant', 'user'] as UserRole[]).map((r) => (
            <div
              key={r}
              onClick={() => setRole(r)}
              className={`flex-1 text-center p-3 rounded-xl cursor-pointer transition-all font-semibold text-sm capitalize
                ${role === r
                  ? 'bg-gradient-to-r from-purple-500 to-cyan-500 text-white shadow-lg hover-glow'
                  : 'glass border border-white/10 text-slate-300 hover:border-purple-500/50'
                }`}
            >
              {r}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block font-semibold mb-2 text-slate-200 text-sm">Email</label>
            <input
              type="text"
              className="input-web3"
              placeholder="Enter Your Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="relative">
            <label className="block font-semibold mb-2 text-slate-200 text-sm">Password</label>
            <input
              type={showPassword ? "text" : "password"}
              className="input-web3 pr-12"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-4 top-[42px] text-slate-400 hover:text-cyan-400 transition-colors"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div className="glass-strong border border-red-500/30 text-red-300 text-sm text-center font-medium p-3 rounded-xl">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-web3 w-full py-4 text-base font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Logging in...' : 'Login to System'}
          </button>
        </form>

        {role === 'admin' && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setShowForgot(true)}
              className="text-sm text-slate-300 hover:text-cyan-400 transition-colors font-medium"
            >
              Forgot Password?
            </button>
          </div>
        )}

        <div className="mt-8 text-center text-xs text-slate-400 border-t border-white/10 pt-6">
          <p>HMS Finance Management System © 2025</p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
          <div className="glass-strong rounded-2xl p-6 w-full max-w-[400px] shadow-2xl relative">
            <button
              onClick={() => setShowForgot(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-red-400 transition-colors"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-bold text-gradient-primary mb-6">Reset Admin Password</h3>

            {forgotSuccess ? (
              <div className="glass-strong border border-green-500/30 text-green-300 p-4 rounded-xl text-center font-medium">
                {forgotSuccess}
              </div>
            ) : (
              <>
                {forgotStep === 1 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-300">
                      Click below to receive your backup code via email, or enter a code manually.
                    </p>
                    <button
                      onClick={handleRequestBackupCodes}
                      className="btn-web3 w-full py-3 flex items-center justify-center gap-2"
                    >
                      <span>📧</span> Send Code to Email
                    </button>

                    <input
                      type="text"
                      className="input-web3"
                      placeholder="Enter Backup Code"
                      value={backupCode}
                      onChange={(e) => setBackupCode(e.target.value)}
                    />
                    <button
                      onClick={handleForgotVerify}
                      className="btn-secondary w-full py-3 btn-verify"
                    >
                      Verify Code
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-300">
                      Identity verified. Enter new password.
                    </p>
                    <input
                      type="password"
                      className="input-web3"
                      placeholder="New Password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <button
                      onClick={handleForgotSubmit}
                      className="btn-web3 w-full py-3"
                    >
                      Reset Password
                    </button>
                  </div>
                )}
                {forgotError && (
                  <div className="glass-strong border border-red-500/30 text-red-300 text-sm text-center mt-4 font-medium p-3 rounded-xl">
                    {forgotError}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};