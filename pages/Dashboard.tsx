import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Banknote,
  Receipt,
  HandCoins,
  Wallet,
  Plus,
  Download,
  X,
  Trash2,
  RotateCcw,
  User as UserIcon,
  FlaskConical,
  Check
} from 'lucide-react';
import { Header } from '../components/Header';
import { StatsCard } from '../components/StatsCard';
import { Skeleton } from '../components/Skeleton';
import { EventData, User, UserRole, PendingRequest } from '../types';
import {
  getEvents,
  createEvent,
  getPublicCredentials,
  updateCredentials,
  getDeletedEvents,
  restoreEvent,
  permanentlyDeleteEvent,
  createRequest,
  getPendingRequests,
  approveRequest,
  deleteRequest,
  getUnreadRequestCount,
  markAllRequestsAsRead
} from '../services/db';

interface DashboardProps {
  user: User;
  onLogout: () => void;
  onSwitchRole: (role: UserRole) => void;
  testingMode: boolean;
  onToggleTestingMode: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onLogout, onSwitchRole, testingMode, onToggleTestingMode, theme, onToggleTheme }) => {
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newEventName, setNewEventName] = useState('');

  // Settings Modal State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'recycle'>('general');
  const [deletedEvents, setDeletedEvents] = useState<EventData[]>([]);
  const [recycleDeleteId, setRecycleDeleteId] = useState<string | null>(null);

  // Request Modal State
  const [isRequestsOpen, setIsRequestsOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Credentials State
  const [adminCreds, setAdminCreds] = useState({ username: '', password: '' });
  const [userCreds, setUserCreds] = useState({ username: '', password: '' });
  const [assistantCreds, setAssistantCreds] = useState({ username: '', password: '' });
  const [credStatus, setCredStatus] = useState('');

  const navigate = useNavigate();

  const loadEvents = async () => {
    const data = await getEvents();
    setEvents(data);
    setLoading(false);
  };

  const loadSettingsData = async () => {
    if (user.role !== 'admin') return;
    const creds = await getPublicCredentials();
    setAdminCreds({ username: creds.adminUsername, password: '' });
    setUserCreds({ username: creds.userUsername, password: '' });
    setAssistantCreds({ username: creds.assistantUsername, password: '' });

    const del = await getDeletedEvents();
    setDeletedEvents(del);
  };

  const loadRequests = async () => {
    if (user.role === 'admin') {
      const reqs = await getPendingRequests();
      setPendingRequests(reqs);
    }
  };

  const loadUnread = async () => {
    if (user.role === 'admin') {
      const count = await getUnreadRequestCount();
      setUnreadCount(count);
    }
  };

  useEffect(() => {
    loadEvents();
    if (user.role === 'admin') {
      loadRequests();
      loadUnread();
    }
  }, [user.role]);

  useEffect(() => {
    if (isSettingsOpen) {
      loadSettingsData();
    }
  }, [isSettingsOpen]);

  useEffect(() => {
    if (isRequestsOpen) {
      loadRequests();
    }
  }, [isRequestsOpen]);

  const handleOpenRequests = async () => {
    setIsRequestsOpen(true);
    if (unreadCount > 0) {
      await markAllRequestsAsRead();
      setUnreadCount(0); // Optimistic update
    }
    loadRequests();
  };

  const handleCreateEvent = async () => {
    if (!newEventName.trim()) return;

    if (user.role === 'assistant') {
      await createRequest(
        'create_event',
        { name: newEventName },
        `Create Event: "${newEventName}"`,
        user.username
      );
    } else {
      await createEvent(newEventName);
    }

    setNewEventName('');
    setIsModalOpen(false);
    loadEvents();
  };

  const handleUpdateCredentials = async (role: UserRole) => {
    setCredStatus('Saving...');
    try {
      if (role === 'admin') {
        if (!adminCreds.username) return;
        await updateCredentials('admin', adminCreds.username, adminCreds.password || undefined);
      } else if (role === 'assistant') {
        if (!assistantCreds.username) return;
        await updateCredentials('assistant', assistantCreds.username, assistantCreds.password || undefined);
      } else {
        if (!userCreds.username) return;
        await updateCredentials('user', userCreds.username, userCreds.password || undefined);
      }
      setCredStatus('Saved successfully!');
      setTimeout(() => setCredStatus(''), 2000);
    } catch (e) {
      setCredStatus('Error saving.');
    }
  };

  const handleRestore = async (id: string) => {
    await restoreEvent(id);
    loadSettingsData();
    loadEvents();
  };

  const handlePermanentDelete = (id: string) => {
    setRecycleDeleteId(id);
  };

  const executePermanentDelete = async () => {
    if (recycleDeleteId) {
      await permanentlyDeleteEvent(recycleDeleteId);
      loadSettingsData();
      setRecycleDeleteId(null);
    }
  };

  const handleApproveRequest = async (req: PendingRequest) => {
    try {
      await approveRequest(req);
      // Update state immediately for smoother UI
      setPendingRequests(prev => prev.filter(r => r.id !== req.id));
      loadEvents();
    } catch (error) {
      console.error("Failed to approve request", error);
    }
  };

  const handleRejectRequest = async (id: string) => {
    // Removed confirmation dialog for immediate action
    try {
      await deleteRequest(id);
      // Immediately update UI state
      setPendingRequests(prev => prev.filter(req => req.id !== id));
      // Ensure sync
      loadRequests();
      loadUnread();
    } catch (e) {
      console.error("Failed to reject request", e);
    }
  };

  // Calculate Global Stats
  let totalCollection = 0;
  let totalExpense = 0;
  let totalLoan = 0;

  const recentTransactions: any[] = [];

  events.forEach(event => {
    event.transactions.forEach(t => {
      if (t.type === 'collection') totalCollection += t.amount;
      if (t.type === 'expense') totalExpense += t.amount;
      if (t.type === 'loan') totalLoan += t.amount;

      // Store all transactions to show recent activity regardless of date
      recentTransactions.push({ ...t, eventName: event.name });
    });
  });

  // Sort by date descending to get most recent first
  recentTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Loan does not affect remaining balance
  const remainingBalance = totalCollection - totalExpense;

  const handleDownloadAllPDF = () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const margin = 14;

      // --- Header Section ---
      // Logo (Image with Fallback)
      try {
        const logoBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAgY0hSTQAAeiYAAICEAAD6AAAAgOgAAHUwAADqYAAAOpgAABdwnLpRPAAAAF5JREFUaN7t2LEJACAMBMHg/kvrQlIIRQW7gO/4i4+11u7M7D56oJ6oJ+qJeqKeqCfqiXqinqgn6ol6op6oJ+qJeqKeqCfqiXqinqgn6ol6op6oJ+qJeqKeqCfqiXo/7wFv4xO111y2bAAAAABJRU5ErkJggg==";
        doc.addImage(logoBase64, 'PNG', margin, 10, 15, 15);
      } catch (logoError) {
        console.warn("Logo image failed, falling back to vector", logoError);
        // Fallback: Vector Logo
        doc.setFillColor(0, 79, 148);
        doc.rect(margin, 10, 15, 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('HMS', margin + 7.5, 19, { align: 'center' });
      }

      // Company Name & Title
      doc.setTextColor(0, 79, 148);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('HMS Finance', margin + 20, 18);

      doc.setTextColor(100, 100, 100);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Financial Management System', margin + 20, 24);

      // Report Title
      doc.setFontSize(16);
      doc.setTextColor(30, 41, 59);
      doc.text('Comprehensive Financial Report', pageWidth - margin, 18, { align: 'right' });

      // NOTE: Metadata (Generated on/by) is added AT THE END to include page count

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(margin, 35, pageWidth - margin, 35);

      // --- Global Summary Section ---
      doc.setFontSize(14);
      doc.setTextColor(0, 79, 148);
      doc.setFont('helvetica', 'bold');
      doc.text('Executive Summary', margin, 45);

      // Summary Cards (Simulated with Rectangles)
      const cardWidth = (pageWidth - (margin * 2) - 15) / 4;
      const cardHeight = 25;
      const cardY = 50;

      const drawSummaryCard = (x: number, title: string, amount: number, color: [number, number, number]) => {
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, 'FD');

        doc.setFontSize(8);
        doc.setTextColor(100, 117, 137);
        doc.text(title, x + 4, cardY + 8);

        doc.setFontSize(12);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.setFont('helvetica', 'bold');
        doc.text(`PKR ${amount.toLocaleString()}`, x + 4, cardY + 18);
      };

      drawSummaryCard(margin, 'Total Collection', totalCollection, [76, 201, 240]);
      drawSummaryCard(margin + cardWidth + 5, 'Total Expense', totalExpense, [220, 38, 38]);
      drawSummaryCard(margin + (cardWidth + 5) * 2, 'Total Loan', totalLoan, [248, 150, 30]);
      drawSummaryCard(margin + (cardWidth + 5) * 3, 'Remaining Balance', remainingBalance, [0, 79, 148]);

      // --- Detailed Event Breakdown ---
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'italic');
      doc.text('Detailed breakdown by event follows below.', margin, cardY + cardHeight + 10);

      let currentY = cardY + cardHeight + 20;

      events.forEach((event, index) => {
        // Check if we need a new page for the header
        if (currentY > pageHeight - 40) {
          doc.addPage();
          currentY = 20;
        }

        // Event Header
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, currentY, pageWidth - (margin * 2), 10, 'F');

        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(event.name, margin + 4, currentY + 7);

        // Event Stats
        const c = event.transactions.filter(t => t.type === 'collection').reduce((acc, t) => acc + t.amount, 0);
        const e = event.transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
        const l = event.transactions.filter(t => t.type === 'loan').reduce((acc, t) => acc + t.amount, 0);
        const b = c - e;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const statsText = `Coll: ${c.toLocaleString()} | Exp: ${e.toLocaleString()} | Loan: ${l.toLocaleString()} | Bal: ${b.toLocaleString()}`;
        doc.setTextColor(71, 85, 105);
        doc.text(statsText, pageWidth - margin - 4, currentY + 7, { align: 'right' });

        currentY += 15;

        // Table
        const tableRows = event.transactions
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .map(t => [
            new Date(t.date).toLocaleDateString(),
            t.name,
            t.type === 'collection' ? t.amount.toLocaleString() : '-',
            t.type === 'expense' ? t.amount.toLocaleString() : '-',
            t.type === 'loan' ? t.amount.toLocaleString() : '-'
          ]);

        autoTable(doc, {
          startY: currentY,
          head: [['Date', 'Title', 'Collection', 'Expense', 'Loan']],
          body: tableRows,
          headStyles: {
            fillColor: [0, 79, 148], // Blue header
            textColor: [255, 255, 255], // White text
            fontStyle: 'bold',
            lineWidth: 0,
            cellPadding: 3,
            halign: 'center'
          },
          bodyStyles: {
            fillColor: [255, 255, 255],
            textColor: [51, 65, 85],
            fontSize: 9,
            cellPadding: 3
          },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 'auto' },
            2: { halign: 'right', textColor: [76, 201, 240], cellWidth: 30 },
            3: { halign: 'right', textColor: [220, 38, 38], cellWidth: 30 },
            4: { halign: 'right', textColor: [248, 150, 30], cellWidth: 30 },
          },
          alternateRowStyles: {
            fillColor: [250, 250, 250]
          },
          styles: {
            lineColor: [226, 232, 240],
            lineWidth: 0.1,
          },
          margin: { left: margin, right: margin },
          theme: 'plain',
          didDrawPage: (data) => {
            // Footer on each page
            const pageCount = doc.getNumberOfPages();
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Page ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
          }
        });

        // Update currentY for next loop
        currentY = (doc as any).lastAutoTable.finalY + 15;
      });

      // --- Post-Generation Additions ---
      const totalPages = doc.getNumberOfPages();



      // 2. Header Metadata (Page 1)
      doc.setPage(1);
      doc.setFontSize(9);
      doc.setTextColor(108, 117, 125);
      const dateStr = new Date().toLocaleString();
      // Add total pages to the right of Generated on
      doc.text(`Generated on: ${dateStr}  |  Total Pages: ${totalPages}`, pageWidth - margin, 24, { align: 'right' });
      doc.text(`Generated by: ${user.username} (${user.role})`, pageWidth - margin, 29, { align: 'right' });

      doc.save(`HMS_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error("PDF Generation Error:", err);
      alert("Failed to generate PDF. Please check console for details.");
    }
  };

  return (
    <div className="min-h-screen bg-mesh">
      <Header
        user={user}
        onLogout={onLogout}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenRequests={user.role === 'admin' ? handleOpenRequests : undefined}
        notificationCount={unreadCount}
        onSwitchRole={onSwitchRole}
        testingMode={testingMode}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main className="max-w-[1200px] mx-auto px-4 py-8">
        {/* Global Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {loading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : (
            <>
              <StatsCard title="Total Collection" amount={totalCollection} icon={Banknote} iconColor="text-[#4cc9f0]" />
              <StatsCard title="Total Expense" amount={totalExpense} icon={Receipt} iconColor="text-red-600" />
              <StatsCard title="Total Loan" amount={totalLoan} icon={HandCoins} iconColor="text-[#f8961e]" />
              <StatsCard title="Remaining Balance" amount={remainingBalance} icon={Wallet} iconColor="text-[#004f94]" amountColor="text-[#004f94]" />
            </>
          )}
        </div>

        {/* Events Dashboard */}
        <div className="glass-strong rounded-3xl shadow-2xl mb-8 overflow-hidden border border-white/10">
          <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
            <h2 className="text-2xl text-gradient-primary font-bold">Event Dashboard</h2>
            <div className="flex gap-2">
              <button
                onClick={handleDownloadAllPDF}
                className="btn-web3 flex items-center gap-2 px-4 py-2 text-sm"
                disabled={loading}
              >
                <Download size={18} /> Download Report
              </button>
              {(user.role === 'admin' || user.role === 'assistant') && (
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="btn-web3 flex items-center gap-2 px-4 py-2 text-sm"
                >
                  <Plus size={18} /> {user.role === 'assistant' ? 'Request Event' : 'Create Event'}
                </button>
              )}
            </div>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {events.length === 0 && <p className="text-slate-300">No events found. Create one to get started.</p>}
                {events.map(event => {
                  const c = event.transactions.filter(t => t.type === 'collection').reduce((acc, t) => acc + t.amount, 0);
                  const e = event.transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
                  const l = event.transactions.filter(t => t.type === 'loan').reduce((acc, t) => acc + t.amount, 0);
                  const b = c - e; // Balance excludes loan

                  return (
                    <div key={event.id} className="card-web3 p-6 hover-lift group">
                      <h3 className="text-xl font-bold mb-4 pb-2 border-b border-white/10" style={{ color: 'var(--text-primary)' }}>{event.name}</h3>
                      <div className="flex justify-between mb-6 text-center">
                        <div>
                          <div className="text-lg font-bold text-cyan-400">{c > 1000 ? `${(c / 1000).toFixed(1)}k` : c}</div>
                          <div className="text-xs text-slate-400 font-medium">Coll.</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-red-400">{e > 1000 ? `${(e / 1000).toFixed(1)}k` : e}</div>
                          <div className="text-xs text-slate-400 font-medium">Exp.</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-orange-400">{l > 1000 ? `${(l / 1000).toFixed(1)}k` : l}</div>
                          <div className="text-xs text-slate-400 font-medium">Loan</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-gradient-primary">{b > 1000 ? `${(b / 1000).toFixed(1)}k` : b}</div>
                          <div className="text-xs text-slate-400 font-medium">Bal.</div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/event/${event.id}`)}
                          className="btn-web3 flex-1 py-2.5 text-sm"
                        >
                          {user.role === 'user' ? 'View Event Detail' : 'Manage Event'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="glass-strong rounded-3xl shadow-2xl mb-8 border border-white/10">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl text-gradient-primary font-bold">Recent Transactions</h2>
          </div>
          <div className="p-6">
            {loading ? (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <>
                {recentTransactions.length === 0 ? (
                  <p className="text-slate-300 text-center py-4">No recent transactions</p>
                ) : (
                  <div className="flex flex-col">
                    {recentTransactions.slice(0, 7).map((t, idx) => (
                      <div key={idx} className="flex justify-between items-center p-4 border-b border-white/10 last:border-0 hover:bg-white/5 transition-colors rounded-lg">
                        <div>
                          <div className="font-semibold text-slate-200">{t.name}</div>
                          <div className="text-sm text-slate-400">{t.eventName} • {new Date(t.date).toLocaleDateString()}</div>
                        </div>
                        <div className={`font-bold ${t.type === 'collection' ? 'text-cyan-400' :
                          t.type === 'expense' ? 'text-red-400' : 'text-orange-400'
                          }`}>
                          {t.type === 'collection' ? '+' : '-'}PKR {t.amount.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Create Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000]">
          <div className="glass-strong rounded-2xl p-8 w-[90%] max-w-[500px] shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gradient-primary">{user.role === 'assistant' ? 'Request Event' : 'Create New Event'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-red-500">
                <X size={24} />
              </button>
            </div>
            <div className="mb-6">
              <label className="block font-semibold mb-1 text-slate-200">Event Name</label>
              <input
                type="text"
                className="input-web3"
                placeholder="Enter event name"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateEvent}
                className="btn-web3 px-6 py-2"
              >
                {user.role === 'assistant' ? 'Send Request' : 'Create Event'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Requests Modal (Approval Center) */}
      {isRequestsOpen && user.role === 'admin' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
          <div className="glass-strong rounded-2xl w-full max-w-[700px] shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h3 className="text-2xl font-bold text-gradient-primary">Pending Approvals</h3>
              <button onClick={() => setIsRequestsOpen(false)} className="text-red-500">
                <X size={24} />
              </button>
            </div>
            <div className="p-0 overflow-y-auto flex-1">
              {pendingRequests.length === 0 ? (
                <div className="text-center py-12 text-slate-300">
                  <p>No pending requests.</p>
                  <p className="text-sm mt-2">Actions taken by the Assistant will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pendingRequests.map((req) => (
                    <div key={req.id} className="p-6 hover:bg-white/5 transition-colors border-b border-white/10 last:border-0">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-bold text-slate-200 text-lg mb-1">{req.description}</div>
                          <div className="text-sm text-gray-500 flex gap-2 items-center flex-wrap">
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs uppercase font-bold">{req.type.replace('_', ' ')}</span>
                            <span>Requested by <span className="font-semibold text-gray-700">{req.requestedBy}</span></span>
                            <span className="text-gray-300">•</span>
                            <span>{new Date(req.timestamp).toLocaleString()}</span>
                          </div>
                          {req.type.includes('transaction') && req.data.transaction && (
                            <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-[#212529] font-semibold block mb-1">Amount:</span>
                                  <strong className="text-[#212529] text-lg">PKR {req.data.transaction.amount.toLocaleString()}</strong>
                                </div>
                                <div>
                                  <span className="text-[#212529] font-semibold block mb-1">Type:</span>
                                  <span className={`uppercase font-bold px-2 py-1 rounded text-xs ${req.data.transaction.type === 'collection' ? 'bg-cyan-100 text-cyan-800' :
                                    req.data.transaction.type === 'expense' ? 'bg-red-100 text-red-800' :
                                      'bg-orange-100 text-orange-800'
                                    }`}>
                                    {req.data.transaction.type}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 mt-4">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRejectRequest(req.id);
                          }}
                          className="px-4 py-2 btn-danger rounded-lg font-semibold text-sm shadow-md"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApproveRequest(req);
                          }}
                          className="px-4 py-2 btn-success rounded-lg font-semibold text-sm flex items-center gap-2 shadow-md"
                        >
                          <Check size={16} /> Approve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
          <div className="glass-strong rounded-2xl w-full max-w-[600px] shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h3 className="text-2xl font-bold text-gradient-primary">Settings</h3>
              <button onClick={() => setIsSettingsOpen(false)} className="text-red-500">
                <X size={24} />
              </button>
            </div>

            <div className="flex border-b">
              <button
                onClick={() => setSettingsTab('general')}
                className={`flex-1 py-3 font-semibold text-sm transition-colors ${settingsTab === 'general' ? 'text-gradient-primary border-b-2 border-purple-500' : 'text-slate-400 hover:bg-white/5'}`}
              >
                Account Management
              </button>
              <button
                onClick={() => setSettingsTab('recycle')}
                className={`flex-1 py-3 font-semibold text-sm transition-colors ${settingsTab === 'recycle' ? 'text-gradient-primary border-b-2 border-purple-500' : 'text-slate-400 hover:bg-white/5'}`}
              >
                Recycle Bin
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {settingsTab === 'general' ? (
                <div className="space-y-8">
                  {/* Testing Mode Settings */}
                  <div className="glass p-4 rounded-lg border border-white/10">
                    <h4 className="font-bold text-gradient-primary mb-4 flex items-center gap-2">
                      <FlaskConical size={18} /> Testing Mode
                    </h4>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-bold" style={{ color: 'var(--text-primary)' }}>Enable Role Switching</div>
                        <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
                          Allows you to switch between Admin, Assistant, and User views to verify permissions and UI.
                        </div>
                      </div>
                      <button
                        onClick={onToggleTestingMode}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
                        style={{ background: testingMode ? 'var(--gradient-primary)' : 'rgba(255,255,255,0.2)' }}
                      >
                        <span
                          className={`${testingMode ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Admin Settings */}
                  <div className="glass p-4 rounded-lg border border-white/10">
                    <h4 className="font-bold text-gradient-primary mb-4 flex items-center gap-2">
                      <UserIcon size={18} /> Update Admin Credentials
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold uppercase mb-1 block" style={{ color: 'var(--text-secondary)' }}>Email</label>
                        <input
                          type="text"
                          className="input-web3"
                          value={adminCreds.username}
                          onChange={(e) => setAdminCreds({ ...adminCreds, username: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase mb-1 block" style={{ color: 'var(--text-secondary)' }}>New Password (Optional)</label>
                        <input
                          type="password"
                          className="input-web3"
                          placeholder="Leave blank to keep current"
                          value={adminCreds.password}
                          onChange={(e) => setAdminCreds({ ...adminCreds, password: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => handleUpdateCredentials('admin')}
                          className="btn-primary px-4 py-2 rounded-lg text-sm font-bold"
                        >
                          Update Admin
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Assistant Settings */}
                  <div className="glass p-4 rounded-lg border border-white/10">
                    <h4 className="font-bold text-gradient-primary mb-4 flex items-center gap-2">
                      <UserIcon size={18} /> Update Assistant Credentials
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold uppercase mb-1 block" style={{ color: 'var(--text-secondary)' }}>Email</label>
                        <input
                          type="text"
                          className="input-web3"
                          value={assistantCreds.username}
                          onChange={(e) => setAssistantCreds({ ...assistantCreds, username: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase mb-1 block" style={{ color: 'var(--text-secondary)' }}>New Password (Optional)</label>
                        <input
                          type="password"
                          className="input-web3"
                          placeholder="Leave blank to keep current"
                          value={assistantCreds.password}
                          onChange={(e) => setAssistantCreds({ ...assistantCreds, password: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => handleUpdateCredentials('assistant')}
                          className="btn-primary px-4 py-2 rounded-lg text-sm font-bold"
                        >
                          Update Assistant
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* User Settings */}
                  <div className="glass p-4 rounded-lg border border-white/10">
                    <h4 className="font-bold text-gradient-primary mb-4 flex items-center gap-2">
                      <UserIcon size={18} /> Update User Credentials
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold uppercase mb-1 block" style={{ color: 'var(--text-secondary)' }}>Email</label>
                        <input
                          type="text"
                          className="input-web3"
                          value={userCreds.username}
                          onChange={(e) => setUserCreds({ ...userCreds, username: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase mb-1 block" style={{ color: 'var(--text-secondary)' }}>New Password (Optional)</label>
                        <input
                          type="password"
                          className="input-web3"
                          placeholder="Leave blank to keep current"
                          value={userCreds.password}
                          onChange={(e) => setUserCreds({ ...userCreds, password: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => handleUpdateCredentials('user')}
                          className="btn-primary px-4 py-2 rounded-lg text-sm font-bold"
                        >
                          Update User
                        </button>
                      </div>
                    </div>
                  </div>

                  {credStatus && (
                    <div className={`p-3 rounded text-center text-sm font-bold ${credStatus.includes('Error') ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                      {credStatus}
                    </div>
                  )}
                </div>
              ) : (
                /* Recycle Bin Tab */
                <div className="space-y-4">
                  <div className="glass border border-yellow-500/30 p-4 rounded-lg flex items-start gap-3">
                    <RotateCcw className="text-yellow-400 shrink-0 mt-1" size={20} />
                    <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <p className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Deleted Events</p>
                      <p>Events here are hidden from the dashboard but can be restored. Permanently deleting them removes all associated data forever.</p>
                    </div>
                  </div>

                  {deletedEvents.length === 0 ? (
                    <div className="text-center py-8 italic" style={{ color: 'var(--text-tertiary)' }}>Recycle bin is empty</div>
                  ) : (
                    <div className="space-y-3">
                      {deletedEvents.map(evt => (
                        <div key={evt.id} className="flex items-center justify-between p-4 glass rounded-lg border border-white/10">
                          <div>
                            <div className="font-bold" style={{ color: 'var(--text-primary)' }}>{evt.name}</div>
                            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{evt.transactions.length} transactions</div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRestore(evt.id)}
                              className="p-2 text-cyan-400 hover:bg-white/10 rounded transition-colors"
                              title="Restore"
                            >
                              <RotateCcw size={18} />
                            </button>
                            <button
                              onClick={() => handlePermanentDelete(evt.id)}
                              className="p-2 text-red-400 hover:bg-white/10 rounded transition-colors"
                              title="Permanently Delete"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Modal Footer (if needed, currently mostly inside scroll area) */}
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {recycleDeleteId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1100]">
          <div className="glass-strong rounded-2xl p-8 w-[90%] max-w-[400px] shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-red-600" size={32} />
            </div>
            <h3 className="text-xl font-bold text-gradient-primary mb-2">Permanently Delete?</h3>
            <p className="text-slate-300 mb-6">
              This action cannot be undone. All transactions associated with this event will be lost forever.
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setRecycleDeleteId(null)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={executePermanentDelete}
                className="px-4 py-2 btn-danger rounded-lg font-bold shadow-md"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};