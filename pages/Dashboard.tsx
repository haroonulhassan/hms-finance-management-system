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
  Check,
  AlertCircle,
  Edit,
  CloudUpload,
  Image as ImageIcon
} from 'lucide-react';
import { Header } from '../components/Header';
import { StatsCard } from '../components/StatsCard';
import { Skeleton } from '../components/Skeleton';
import { EventData, User, UserRole, PendingRequest, Transaction } from '../types';
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
  markAllRequestsAsRead,
  updateTransaction,
  deleteTransaction,
  addTransaction,
  updateRequest,
  uploadImage
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
  const [createError, setCreateError] = useState('');

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

  // Dashboard Search & Filter State
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardFilterType, setDashboardFilterType] = useState('all');

  // Transaction Management State
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<any | null>(null); // any because it has eventId
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    type: 'collection' as 'collection' | 'expense' | 'loan',
    description: '',
    image: ''
  });

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
    } else if (user.role === 'assistant') {
      // Load only assistant's own requests
      const allReqs = await getPendingRequests();
      const myReqs = allReqs.filter(req => req.requestedBy === user.username);
      setPendingRequests(myReqs);
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
    } else if (user.role === 'assistant') {
      // Load assistant's own requests
      loadRequests();
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
    setCreateError('');

    // Check for duplicate name in existing events (case-insensitive)
    const isDuplicateEvent = events.some(e => e.name.toLowerCase() === newEventName.trim().toLowerCase());
    if (isDuplicateEvent) {
      setCreateError('Event name already exists. Please choose a different name.');
      return;
    }

    // For assistants, also check pending create_event requests
    if (user.role === 'assistant') {
      const isDuplicateRequest = pendingRequests.some(
        req => req.type === 'create_event' &&
          req.data.name.toLowerCase() === newEventName.trim().toLowerCase()
      );
      if (isDuplicateRequest) {
        setCreateError('You already have a pending request to create an event with this name.');
        return;
      }

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
    if (user.role === 'assistant') {
      loadRequests();
    }
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
      recentTransactions.push({ ...t, eventName: event.name, eventId: event.id });
    });
  });

  // Sort by date descending to get most recent first
  recentTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Filter Recent Transactions
  const filteredRecentTransactions = recentTransactions.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(dashboardSearch.toLowerCase());
    const matchesType = dashboardFilterType === 'all' || t.type === dashboardFilterType;
    return matchesSearch && matchesType;
  });

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

  const handleEditTransaction = (tx: any) => {
    setEditingTransaction(tx);
    setSelectedEventId(tx.eventId);
    setFormData({
      name: tx.name,
      amount: tx.amount.toString(),
      date: tx.date,
      type: tx.type,
      description: tx.description || '',
      image: tx.image || ''
    });
    setIsTransactionModalOpen(true);
  };

  const handleDeleteTransaction = (tx: any) => {
    setTransactionToDelete(tx);
    setSelectedEventId(tx.eventId);
    setShowDeleteConfirm(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        const imageUrl = await uploadImage(file);
        setFormData(prev => ({ ...prev, image: imageUrl }));
      } catch (error) {
        console.error("Image upload failed:", error);
        alert("Failed to upload image. Please try again.");
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleSaveTransaction = async () => {
    if (!selectedEventId || !editingTransaction) return;

    if (!formData.name || !formData.amount) return;

    const amount = parseFloat(formData.amount);
    if (isNaN(amount)) return;

    try {
      const newTxData = {
        name: formData.name,
        amount,
        date: formData.date,
        type: formData.type,
        description: formData.description,
        image: formData.image
      };

      const updated: Transaction = {
        ...editingTransaction,
        ...newTxData
      };

      // Find the event name for the request description
      const eventName = events.find(e => e.id === selectedEventId)?.name || 'Unknown Event';

      if (user.role === 'assistant') {
        await createRequest(
          'update_transaction',
          { eventId: selectedEventId, eventName: eventName, transaction: updated },
          `Update Transaction: "${formData.name}" in "${eventName}"`,
          user.username
        );
      } else {
        await updateTransaction(selectedEventId, updated);
      }

      setFormData({
        name: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        type: 'collection',
        description: '',
        image: ''
      });
      setEditingTransaction(null);
      setIsTransactionModalOpen(false);
      loadEvents();
    } catch (error) {
      console.error("Failed to save transaction", error);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedEventId || !transactionToDelete) return;

    try {
      const eventName = events.find(e => e.id === selectedEventId)?.name || 'Unknown Event';

      if (user.role === 'assistant') {
        await createRequest(
          'delete_transaction',
          { eventId: selectedEventId, eventName: eventName, transactionId: transactionToDelete.id, transactionName: transactionToDelete.name },
          `Delete Transaction: "${transactionToDelete.name}" from "${eventName}"`,
          user.username
        );
      } else {
        await deleteTransaction(selectedEventId, transactionToDelete.id);
      }

      loadEvents();
      setShowDeleteConfirm(false);
      setTransactionToDelete(null);
    } catch (error) {
      console.error("Failed to delete transaction", error);
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

                  const handleEditTransaction = (tx: any) => {
                    setEditingTransaction(tx);
                    setSelectedEventId(tx.eventId);
                    setFormData({
                      name: tx.name,
                      amount: tx.amount.toString(),
                      date: tx.date,
                      type: tx.type,
                      description: tx.description || '',
                      image: tx.image || ''
                    });
                    setIsTransactionModalOpen(true);
                  };

                  const handleDeleteTransaction = (tx: any) => {
                    setTransactionToDelete(tx);
                    setSelectedEventId(tx.eventId);
                    setShowDeleteConfirm(true);
                  };

                  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setIsUploading(true);
                      try {
                        const imageUrl = await uploadImage(file);
                        setFormData(prev => ({ ...prev, image: imageUrl }));
                      } catch (error) {
                        console.error("Image upload failed:", error);
                        alert("Failed to upload image. Please try again.");
                      } finally {
                        setIsUploading(false);
                      }
                    }
                  };

                  const handleSaveTransaction = async () => {
                    if (!selectedEventId || !editingTransaction) return;

                    if (!formData.name || !formData.amount) return;

                    const amount = parseFloat(formData.amount);
                    if (isNaN(amount)) return;

                    try {
                      const newTxData = {
                        name: formData.name,
                        amount,
                        date: formData.date,
                        type: formData.type,
                        description: formData.description,
                        image: formData.image
                      };

                      const updated: Transaction = {
                        ...editingTransaction,
                        ...newTxData
                      };

                      // Find the event name for the request description
                      const eventName = events.find(e => e.id === selectedEventId)?.name || 'Unknown Event';

                      if (user.role === 'assistant') {
                        await createRequest(
                          'update_transaction',
                          { eventId: selectedEventId, eventName: eventName, transaction: updated },
                          `Update Transaction: "${formData.name}" in "${eventName}"`,
                          user.username
                        );
                      } else {
                        await updateTransaction(selectedEventId, updated);
                      }

                      setFormData({
                        name: '',
                        amount: '',
                        date: new Date().toISOString().split('T')[0],
                        type: 'collection',
                        description: '',
                        image: ''
                      });
                      setEditingTransaction(null);
                      setIsTransactionModalOpen(false);
                      loadEvents();
                    } catch (error) {
                      console.error("Failed to save transaction", error);
                    }
                  };

                  const handleConfirmDelete = async () => {
                    if (!selectedEventId || !transactionToDelete) return;

                    try {
                      const eventName = events.find(e => e.id === selectedEventId)?.name || 'Unknown Event';

                      if (user.role === 'assistant') {
                        await createRequest(
                          'delete_transaction',
                          { eventId: selectedEventId, eventName: eventName, transactionId: transactionToDelete.id, transactionName: transactionToDelete.name },
                          `Delete Transaction: "${transactionToDelete.name}" from "${eventName}"`,
                          user.username
                        );
                      } else {
                        await deleteTransaction(selectedEventId, transactionToDelete.id);
                      }

                      loadEvents();
                      setShowDeleteConfirm(false);
                      setTransactionToDelete(null);
                    } catch (error) {
                      console.error("Failed to delete transaction", error);
                    }
                  };

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

        {/* Pending Approvals Section (Admin Only) */}
        {user.role === 'admin' && pendingRequests.length > 0 && (
          <div className="glass-strong rounded-3xl shadow-2xl mb-8 border-l-4 border-l-yellow-400 border-white/10">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl text-gradient-primary font-bold flex items-center gap-2">
                <AlertCircle size={20} className="text-yellow-400" /> Pending Approvals
              </h2>
              <span className="bg-yellow-400/20 text-yellow-400 px-3 py-1 rounded-full text-xs font-bold">
                {pendingRequests.length} Pending
              </span>
            </div>
            <div className="p-6">
              <div className="flex flex-col gap-4">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-[rgba(242,242,249,0.49)] dark:bg-white/5 rounded-lg border border-white/10 hover:bg-[rgba(242,242,249,0.49)] dark:hover:bg-white/10 transition-colors gap-4 shadow-sm">
                    <div className="flex-1 w-full">
                      <div className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{req.description}</div>
                      <div className="text-xs flex flex-col items-start gap-2 sm:flex-row sm:items-center" style={{ color: 'var(--text-tertiary)' }}>
                        <span className="uppercase font-bold text-cyan-400">{req.type.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>{req.requestedBy}</span>
                        <span>•</span>
                        <span>{new Date(req.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => handleApproveRequest(req)}
                        className="flex-1 sm:flex-none btn-success px-3 py-1.5 rounded text-sm font-bold flex items-center justify-center gap-1"
                        title="Approve"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={() => handleRejectRequest(req.id)}
                        className="flex-1 sm:flex-none btn-danger px-3 py-1.5 rounded text-sm font-bold flex items-center justify-center gap-1"
                        title="Reject"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Assistant's Pending Requests */}
        {user.role === 'assistant' && pendingRequests.length > 0 && (
          <div className="glass-strong rounded-3xl shadow-2xl mb-8 border border-white/10 border-l-4 border-l-yellow-400">
            <div className="p-6 border-b border-white/10">
              <h2 className="text-xl text-gradient-primary font-bold flex items-center gap-2">
                <AlertCircle size={24} className="text-yellow-400" />
                My Pending Requests
              </h2>
            </div>
            <div className="p-6">
              <div className="flex flex-col gap-4">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 mb-2 bg-[rgba(242,242,249,0.49)] dark:bg-white/5 rounded-lg shadow-sm hover:bg-[rgba(242,242,249,0.49)] dark:hover:bg-white/10 transition-colors gap-4">
                    <div className="flex-1">
                      <div className="font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{req.description}</div>
                      <div className="text-xs flex gap-2 items-center" style={{ color: 'var(--text-tertiary)' }}>
                        <span className="text-cyan-400 dark:text-blue-300 px-2 py-0.5 rounded text-xs uppercase font-bold">{req.type.replace('_', ' ')}</span>
                        <span>•</span>
                        <span>{new Date(req.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => handleRejectRequest(req.id)}
                        className="flex-1 sm:flex-none btn-danger px-3 py-1.5 rounded text-sm font-bold flex items-center justify-center gap-1"
                      >
                        <X size={14} /> Cancel Request
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        <div className="glass-strong rounded-3xl shadow-2xl mb-8 border border-white/10">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl text-gradient-primary font-bold">Recent Transactions</h2>
          </div>
          <div className="p-6">
            {/* Search and Filter Controls */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Search transactions by title..."
                  className="w-full bg-[rgba(242,242,249,0.49)] dark:bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50 transition-all"
                  style={{ color: 'var(--text-primary)' }}
                  value={dashboardSearch}
                  onChange={(e) => setDashboardSearch(e.target.value)}
                />
              </div>
              <div className="sm:w-48">
                <select
                  className="w-full bg-[rgba(242,242,249,0.49)] dark:bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/50 transition-all appearance-none cursor-pointer"
                  style={{ color: 'var(--text-primary)' }}
                  value={dashboardFilterType}
                  onChange={(e) => setDashboardFilterType(e.target.value)}
                >
                  <option value="all" className="bg-white dark:bg-slate-800 text-white">All Types</option>
                  <option value="collection" className="bg-white dark:bg-slate-800 text-white">Collection</option>
                  <option value="expense" className="bg-white dark:bg-slate-800 text-white">Expense</option>
                  <option value="loan" className="bg-white dark:bg-slate-800 text-white">Loan</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <>
                {filteredRecentTransactions.length === 0 ? (
                  <p className="text-slate-300 text-center py-4">No transactions match your search.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {filteredRecentTransactions.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex justify-between items-center p-4 mb-2 bg-[rgba(242,242,249,0.49)] dark:bg-white/5 rounded-lg shadow-sm hover:bg-[rgba(242,242,249,0.49)] dark:hover:bg-white/10 transition-colors group">
                        <div>
                          <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>{t.name}</div>
                          <div className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{t.eventName} • {new Date(t.date).toLocaleDateString()}</div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className={`font-bold ${t.type === 'collection' ? 'text-cyan-400' :
                            t.type === 'expense' ? 'text-red-400' : 'text-orange-400'
                            }`}>
                            {t.type === 'collection' ? '+' : '-'}PKR {t.amount.toLocaleString()}
                          </div>

                          {(user.role === 'admin' || user.role === 'assistant') && (
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleEditTransaction(t)}
                                className="p-1.5 btn-primary rounded hover:scale-105 transition-all shadow-sm"
                                title="Edit"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteTransaction(t)}
                                className="p-1.5 btn-danger rounded hover:scale-105 transition-all shadow-sm"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div >
      </main >

      {/* Create Event Modal */}
      {
        isModalOpen && (
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
                  onChange={(e) => {
                    setNewEventName(e.target.value);
                    setCreateError('');
                  }}
                  autoFocus
                />
                {createError && <p className="text-red-500 text-sm mt-2">{createError}</p>}
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
        )
      }

      {/* Transaction Form Modal */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
          <div className="glass-strong rounded-2xl p-6 md:p-8 w-full max-w-[600px] shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gradient-primary">
                {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
              </h3>
              <button onClick={() => setIsTransactionModalOpen(false)} className="text-red-500">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Transaction Title *</label>
                <input
                  type="text"
                  className="input-web3 w-full"
                  placeholder="e.g. Monthly Fee"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Amount (PKR) *</label>
                <input
                  type="number"
                  className="input-web3 w-full"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Date</label>
                <input
                  type="date"
                  className="input-web3 w-full"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Type</label>
                <select
                  className="input-web3 w-full"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                >
                  <option value="collection">Collection (+)</option>
                  <option value="expense">Expense (-)</option>
                  <option value="loan">Loan (Neutral)</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Description (Optional)</label>
              <textarea
                className="input-web3 w-full h-24 resize-none"
                placeholder="Add details..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="mb-6">
              <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Receipt Image (Optional)</label>
              <div className="flex items-center gap-4">
                <label className="cursor-pointer btn-web3 px-4 py-2 flex items-center gap-2 text-sm">
                  <CloudUpload size={18} /> Upload Image
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
                {isUploading && <span className="text-sm text-cyan-400 animate-pulse">Uploading...</span>}
                {formData.image && (
                  <div className="relative group">
                    <img src={formData.image} alt="Receipt" className="h-12 w-12 object-cover rounded border border-white/20" />
                    <button
                      onClick={() => setFormData({ ...formData, image: '' })}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setIsTransactionModalOpen(false)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTransaction}
                className="btn-web3 px-6 py-2"
                disabled={!formData.name || !formData.amount || isUploading}
              >
                {user.role === 'assistant' ? 'Send Request' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000]">
          <div className="glass-strong rounded-2xl p-8 w-[90%] max-w-[400px] shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Confirm Deletion</h3>
            <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to delete this transaction? This action cannot be undone.
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                {user.role === 'assistant' ? 'Request Delete' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Requests Modal (Approval Center) */}
      {
        isRequestsOpen && user.role === 'admin' && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
            <div className="bg-white dark:bg-[#1e293b] rounded-2xl w-full max-w-[700px] shadow-2xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-white/10">
              <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-white/10 bg-white my_pa dark:bg-transparent">
                <h3 className="text-2xl font-bold text-gradient-primary">Pending Approvals</h3>
                <button onClick={() => setIsRequestsOpen(false)} className="text-red-500">
                  <X size={24} />
                </button>
              </div>
              <div className="p-0 overflow-y-auto flex-1 dark:bg-transparent my_pa2">
                {pendingRequests.length === 0 ? (
                  <div className="text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
                    <p>No pending requests.</p>
                    <p className="text-sm mt-2">Actions taken by the Assistant will appear here.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {pendingRequests.map((req) => (
                      <div key={req.id} className="card-web3 p-6 mb-3 my_card">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <div className="font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>{req.description}</div>
                            <div className="text-sm flex gap-2 items-center flex-wrap" style={{ color: 'var(--text-tertiary)' }}>
                              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-100 px-2 py-0.5 rounded text-xs uppercase font-bold">{req.type.replace('_', ' ')}</span>
                              <span>Requested by <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>{req.requestedBy}</span></span>
                              <span>•</span>
                              <span>{new Date(req.timestamp).toLocaleString()}</span>
                            </div>
                            {req.type.includes('transaction') && req.data.transaction && (
                              <div className="mt-3 p-3 rounded text-sm pending-transaction-card">
                                <div className="grid grid-cols-3 gap-4 items-center" style={{ backgroundColor: 'transparent' }}>
                                  <div>
                                    <span className="font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>Amount:</span>
                                    <strong className="text-lg" style={{ color: 'var(--text-primary)' }}>PKR {req.data.transaction.amount.toLocaleString()}</strong>
                                  </div>
                                  <div>
                                    <span className="font-semibold block mb-1" style={{ color: 'var(--text-secondary)' }}>Type:</span>
                                    <span className={`uppercase font-bold px-2 py-1 rounded text-xs ${req.data.transaction.type === 'collection' ? 'bg-blue-100 text-blue-700 dark:bg-cyan-900/30 dark:text-cyan-300' :
                                      req.data.transaction.type === 'expense' ? 'bg-blue-100 text-blue-700 dark:bg-red-900/30 dark:text-red-300' :
                                        'bg-blue-100 text-blue-700 dark:bg-orange-900/30 dark:text-orange-300'
                                      }`}>
                                      {req.data.transaction.type}
                                    </span>
                                  </div>
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRejectRequest(req.id);
                                      }}
                                      className="p-2 btn-danger rounded-lg shadow-md hover:scale-105 transition-all"
                                      title="Reject"
                                    >
                                      <X size={18} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleApproveRequest(req);
                                      }}
                                      className="p-2 btn-success rounded-lg shadow-md hover:scale-105 transition-all"
                                      title="Approve"
                                    >
                                      <Check size={18} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* Settings Modal */}
      {
        isSettingsOpen && (
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
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${!testingMode ? 'dark:bg-white/20' : ''}`}
                          style={{ background: testingMode ? 'var(--gradient-primary)' : 'rgb(245, 245, 245)' }}
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
        )
      }

      {/* Permanent Delete Confirmation Modal */}
      {
        recycleDeleteId && (
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
        )
      }
    </div >
  );
};