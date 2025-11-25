import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ArrowLeft,
  Trash2,
  Download,
  Plus,
  Banknote,
  Receipt,
  HandCoins,
  Wallet,
  X,
  CloudUpload,
} from 'lucide-react';

import { Header } from '../components/Header';
import { StatsCard } from '../components/StatsCard';
import { TransactionList } from '../components/TransactionList';
import { Skeleton } from '../components/Skeleton';
import { EventData, User, Transaction, UserRole } from '../types';
import {
  getEventById,
  deleteEvent,
  addTransaction,
  deleteTransaction,
  updateTransaction,
  createRequest,
  getPendingRequestsByEvent,
  updateRequest,
  deleteRequest
} from '../services/db';
import { compressImage } from '../src/utils/imageCompressor.ts';

interface EventDetailProps {
  user: User;
  onLogout: () => void;
  onSwitchRole: (role: UserRole) => void;
  testingMode: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const EventDetail: React.FC<EventDetailProps> = ({ user, onLogout, onSwitchRole, testingMode, theme, onToggleTheme }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventData | undefined>(undefined);
  const [displayTransactions, setDisplayTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  // Compression State
  const [isCompressing, setIsCompressing] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    type: 'collection' as 'collection' | 'expense' | 'loan',
    description: '',
    image: ''
  });

  const loadEvent = async () => {
    if (!id) return;
    setLoading(true);

    // Fetch Event
    const data = await getEventById(id);
    if (!data) {
      navigate('/');
      return;
    }
    setEvent(data);

    // Fetch Pending Requests for this event
    const pendingRequests = await getPendingRequestsByEvent(id);

    // Merge transactions
    const mergedTransactions = [...data.transactions];

    pendingRequests.forEach(req => {
      if (req.type === 'add_transaction') {
        // For new transactions, create a temporary transaction object
        // Use Request ID as the Transaction ID for the UI keys to work
        mergedTransactions.push({
          ...req.data.transaction,
          id: req.id,
          _isPending: true,
          _requestId: req.id,
          _pendingAction: 'add'
        });
      } else if (req.type === 'update_transaction') {
        // For updates, find the existing transaction and flag it
        const existing = mergedTransactions.find(t => t.id === req.data.transaction.id);
        if (existing) {
          existing._isPending = true;
          existing._requestId = req.id;
          existing._pendingAction = 'update';
          existing._pendingData = req.data.transaction;
        }
      } else if (req.type === 'delete_transaction') {
        // For deletions, flag the existing transaction
        const existing = mergedTransactions.find(t => t.id === req.data.transactionId);
        if (existing) {
          existing._isPending = true;
          existing._requestId = req.id;
          existing._pendingAction = 'delete';
        }
      }
    });

    setDisplayTransactions(mergedTransactions);
    setLoading(false);
  };

  useEffect(() => {
    loadEvent();

    // Real-time updates listener
    const channel = new BroadcastChannel('hms_sync');
    channel.onmessage = () => {
      loadEvent();
    };
    return () => channel.close();
  }, [id]);

  const handleDeleteEvent = async () => {
    if (!event) return;

    if (user.role === 'assistant') {
      await createRequest(
        'delete_event',
        { eventId: event.id, eventName: event.name },
        `Delete Event: "${event.name}"`,
        user.username
      );
      navigate('/');
      return;
    }

    await deleteEvent(event.id);
    navigate('/');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      try {
        // Compress image to ensure it is under 58.3 KB
        const compressedBase64 = await compressImage(file, 800, 0.6, 58.3);
        setFormData(prev => ({ ...prev, image: compressedBase64 }));
      } catch (error) {
        console.error("Image compression failed:", error);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleSaveTransaction = async () => {
    if (!event) return;

    if (!formData.name || !formData.amount) {
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount)) {
      return;
    }

    try {
      const newTxData = {
        name: formData.name,
        amount,
        date: formData.date,
        type: formData.type,
        description: formData.description,
        image: formData.image
      };

      // SCENARIO 1: Editing an Existing Item (Real or Pending)
      if (editingTransaction) {

        // 1.a: Editing a Pending Request (Assistant modifies their own request)
        if (editingTransaction._isPending && editingTransaction._requestId) {

          if (editingTransaction._pendingAction === 'add') {
            // Update the "add_transaction" request
            await updateRequest(
              editingTransaction._requestId,
              { eventId: event.id, eventName: event.name, transaction: newTxData },
              `Add Transaction: "${formData.name}" (PKR ${amount}) to "${event.name}"`
            );
          } else if (editingTransaction._pendingAction === 'update') {
            // Update the "update_transaction" request
            // We need to preserve the ID of the original transaction being updated
            const originalId = editingTransaction._pendingData?.id || editingTransaction.id;
            const updatedTxWithId = { ...newTxData, id: originalId };

            await updateRequest(
              editingTransaction._requestId,
              { eventId: event.id, eventName: event.name, transaction: updatedTxWithId },
              `Update Transaction: "${formData.name}" in "${event.name}"`
            );
          }
          // Alert and reload handled below

        } else {
          // 1.b: Editing a committed transaction
          const updated: Transaction = {
            ...editingTransaction,
            ...newTxData,
            image: formData.image
          };

          if (user.role === 'assistant') {
            await createRequest(
              'update_transaction',
              { eventId: event.id, eventName: event.name, transaction: updated },
              `Update Transaction: "${formData.name}" in "${event.name}"`,
              user.username
            );
          } else {
            await updateTransaction(event.id, updated);
          }
        }

      } else {
        // SCENARIO 2: Creating a New Transaction
        if (user.role === 'assistant') {
          await createRequest(
            'add_transaction',
            { eventId: event.id, eventName: event.name, transaction: newTxData },
            `Add Transaction: "${formData.name}" (PKR ${amount}) to "${event.name}"`,
            user.username
          );
        } else {
          await addTransaction(event.id, newTxData);
        }
      }

      // Reset and reload
      setFormData({
        name: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        type: 'collection',
        description: '',
        image: ''
      });
      setEditingTransaction(null);
      setShowTransactionForm(false);
      loadEvent();
    } catch (error: any) {
      console.error("Failed to save transaction", error);
    }
  };

  const handleEditClick = (tx: Transaction) => {
    setEditingTransaction(tx);

    // If it's a pending update, populate form with the PENDING new data, not the old data
    const dataToLoad = (tx._pendingAction === 'update' && tx._pendingData) ? tx._pendingData : tx;

    setFormData({
      name: dataToLoad.name,
      amount: dataToLoad.amount.toString(),
      date: dataToLoad.date,
      type: dataToLoad.type,
      description: dataToLoad.description || '',
      image: dataToLoad.image || ''
    });
    setShowTransactionForm(true);
  };

  const handleRequestDeleteTransaction = (tx: Transaction) => {
    setTransactionToDelete(tx);
  };

  const confirmDeleteTransaction = async () => {
    if (!event || !transactionToDelete) return;

    try {
      // SCENARIO: Deleting a Pending Request (Cancellation)
      if (transactionToDelete._isPending && transactionToDelete._requestId) {
        await deleteRequest(transactionToDelete._requestId);
        // No alert needed, just removal
      } else {
        // SCENARIO: Deleting a real transaction
        if (user.role === 'assistant') {
          await createRequest(
            'delete_transaction',
            { eventId: event.id, eventName: event.name, transactionId: transactionToDelete.id, transactionName: transactionToDelete.name },
            `Delete Transaction: "${transactionToDelete.name}" from "${event.name}"`,
            user.username
          );
        } else {
          await deleteTransaction(event.id, transactionToDelete.id);
        }
      }

      // Reload
      await loadEvent();
      setTransactionToDelete(null);
    } catch (error) {
      console.error("Failed to delete transaction", error);
    }
  };

  const downloadPDF = () => {
    if (!event) return;
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
      doc.text(`Event Report: ${event.name}`, pageWidth - margin, 18, { align: 'right' });

      // Metadata (Right Aligned) - Moved to end for page count

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(margin, 35, pageWidth - margin, 35);

      // Filter out pending items from calc if they are 'add' type
      const committedTransactions = displayTransactions.filter(t => !t._isPending || t._pendingAction !== 'add');

      // Stats
      const c = committedTransactions.filter(t => t.type === 'collection').reduce((a, b) => a + b.amount, 0);
      const e = committedTransactions.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
      const l = committedTransactions.filter(t => t.type === 'loan').reduce((a, b) => a + b.amount, 0);
      const b = c - e; // Balance excludes loan

      doc.setFontSize(14);
      doc.setTextColor(0, 79, 148);
      doc.setFont('helvetica', 'bold');
      doc.text('Financial Summary', margin, 45);

      // Summary Cards (Simulated)
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

      drawSummaryCard(margin, 'Collections', c, [76, 201, 240]);
      drawSummaryCard(margin + cardWidth + 5, 'Expenses', e, [220, 38, 38]);
      drawSummaryCard(margin + (cardWidth + 5) * 2, 'Loans', l, [248, 150, 30]);
      drawSummaryCard(margin + (cardWidth + 5) * 3, 'Balance', b, [0, 79, 148]);

      // Table
      const tableData = committedTransactions.map(t => [
        t.date,
        t.name,
        t.type === 'collection' ? t.amount.toLocaleString() : '-',
        t.type === 'expense' ? t.amount.toLocaleString() : '-',
        t.type === 'loan' ? t.amount.toLocaleString() : '-'
      ]);

      autoTable(doc, {
        startY: 85,
        head: [['Date', 'Title', 'Collection', 'Expense', 'Loan']],
        body: tableData,
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

      // --- Post-Generation Additions ---
      const totalPages = doc.getNumberOfPages();





      // 2. Header Metadata (Page 1)
      doc.setPage(1);
      doc.setFontSize(9);
      doc.setTextColor(108, 117, 125);
      const dateStr = new Date().toLocaleString();
      doc.text(`Generated on: ${dateStr}  |  Total Pages: ${totalPages}`, pageWidth - margin, 24, { align: 'right' });
      doc.text(`Generated by: ${user.username} (${user.role})`, pageWidth - margin, 29, { align: 'right' });

      doc.save(`${event.name.replace(/\s+/g, '_')}_report.pdf`);
    } catch (err) {
      console.error("PDF Generation Error:", err);
      alert("Failed to generate PDF. Please check console for details.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-mesh">
        <Header user={user} onLogout={onLogout} onSwitchRole={onSwitchRole} testingMode={testingMode} theme={theme} onToggleTheme={onToggleTheme} />
        <main className="max-w-[1200px] mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center mb-8 pb-4 border-b border-gray-200 gap-4">
            <Skeleton className="h-10 w-48" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-96 w-full rounded-3xl" />
        </main>
      </div>
    );
  }

  if (!event) return <div className="p-8 text-center text-red-400">Event not found</div>;

  // Calculate stats (Using displayTransactions but filtering out pending ADDs for accurate current balance?)
  // Actually, if I want to show the *expected* balance, I might include them.
  // But typically Dashboard balance is committed. Let's keep stats as committed only.
  const committedTx = displayTransactions.filter(t => !t._isPending || t._pendingAction !== 'add');
  const coll = committedTx.filter(t => t.type === 'collection').reduce((a, t) => a + t.amount, 0);
  const exp = committedTx.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  const loan = committedTx.filter(t => t.type === 'loan').reduce((a, t) => a + t.amount, 0);
  const bal = coll - exp; // Balance excludes loan

  return (
    <div className="min-h-screen bg-mesh">
      <Header user={user} onLogout={onLogout} onSwitchRole={onSwitchRole} testingMode={testingMode} theme={theme} onToggleTheme={onToggleTheme} />

      <main className="max-w-[1200px] mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 pb-4 border-b border-gray-200 gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="glass hover:bg-white/10 p-2.5 rounded-lg transition-all hover-glow">
              <ArrowLeft size={24} className="text-cyan-400" />
            </button>
            <h1 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{event.name}</h1>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard title="Total Collection" amount={coll} icon={Banknote} iconColor="text-[#4cc9f0]" />
          <StatsCard title="Total Expense" amount={exp} icon={Receipt} iconColor="text-red-600" />
          <StatsCard title="Total Loan" amount={loan} icon={HandCoins} iconColor="text-[#f8961e]" />
          <StatsCard title="Remaining Balance" amount={bal} icon={Wallet} iconColor="text-[#004f94]" />
        </div>

        {/* Transactions Table */}
        <div className="glass-strong rounded-3xl shadow-2xl p-6 border border-white/10">
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <h2 className="text-xl text-gradient-primary font-bold">Transactions</h2>
            <div className="flex gap-2">
              {(user.role === 'admin' || user.role === 'assistant') && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="btn-danger px-4 py-2 rounded-lg flex items-center gap-2 font-medium shadow-sm"
                >
                  <Trash2 size={16} /> <span className="hidden md:inline">{user.role === 'assistant' ? 'Request Delete' : 'Delete Event'}</span>
                </button>
              )}

              <button
                onClick={downloadPDF}
                className="btn-web3 flex items-center gap-2 px-4 py-2 text-sm"
              >
                <Download size={16} /> <span className="hidden md:inline">Download PDF</span>
              </button>

              {(user.role === 'admin' || user.role === 'assistant') && (
                <button
                  onClick={() => {
                    setEditingTransaction(null);
                    setFormData({
                      name: '',
                      amount: '',
                      date: new Date().toISOString().split('T')[0],
                      type: 'collection',
                      description: '',
                      image: ''
                    });
                    setShowTransactionForm(true);
                  }}
                  className="btn-web3 flex items-center gap-2 px-4 py-2 font-bold shadow-md"
                >
                  <Plus size={16} /> {user.role === 'assistant' ? 'Request Tx' : 'Add Transaction'}
                </button>
              )}
            </div>
          </div>
          <TransactionList
            transactions={displayTransactions}
            userRole={user.role}
            onEdit={handleEditClick}
            onDelete={handleRequestDeleteTransaction}
            onViewImage={(src) => setShowImageModal(src)}
          />
        </div>
      </main>

      {/* Transaction Form Modal */}
      {showTransactionForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
          <div className="glass-strong rounded-2xl p-6 md:p-8 w-full max-w-[600px] shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gradient-primary">
                {editingTransaction
                  ? (editingTransaction._isPending ? 'Edit Request' : 'Edit Transaction')
                  : (user.role === 'assistant' ? 'Request New Transaction' : 'Add New Transaction')}
              </h3>
              <button onClick={() => setShowTransactionForm(false)} className="text-red-500">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Transaction Title *</label>
                <input
                  type="text"
                  className="input-web3"
                  placeholder="e.g. Catering, Ticket Sales"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Amount (PKR) *</label>
                <input
                  type="number"
                  className="input-web3"
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
                  className="input-web3"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div>
                <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Type</label>
                <div className="flex gap-2 h-[50px] items-center">
                  {[
                    { id: 'collection', label: 'Collection', color: 'text-[#4cc9f0]' }, // Cyan
                    { id: 'expense', label: 'Expense', color: 'text-red-600' }, // Red
                    { id: 'loan', label: 'Loan', color: 'text-[#f8961e]' } // Orange
                  ].map((t) => (
                    <label key={t.id} className="flex items-center cursor-pointer mr-3 select-none">
                      <input
                        type="radio"
                        name="type"
                        value={t.id}
                        checked={formData.type === t.id}
                        onChange={() => setFormData({ ...formData, type: t.id as any })}
                        className="mr-1 w-4 h-4 accent-[#004f94]"
                      />
                      <span className={`font-bold text-sm ${formData.type === t.id ? t.color : 'text-[#6c757d]'}`}>
                        {t.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Description</label>
              <textarea
                className="input-web3 h-24 resize-none"
                placeholder="Add details..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="mb-6">
              <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Receipt / Image</label>
              <div className="input-web3 border-2 border-dashed rounded-lg p-6 text-center hover:bg-white/10 transition-all relative cursor-pointer group">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={isCompressing}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center pointer-events-none">
                  {isCompressing ? (
                    <div className="flex flex-col items-center justify-center py-4">
                      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                      <span className="text-white font-bold text-sm">Compressing...</span>
                    </div>
                  ) : formData.image ? (
                    <div className="relative z-20">
                      <img src={formData.image} alt="Preview" className="h-32 object-contain mb-3 rounded shadow-md" />
                      <div className="text-sm font-medium glass px-3 py-1 rounded-full shadow-sm inline-block border border-white/20" style={{ color: 'var(--text-primary)' }}>Click to change</div>
                    </div>
                  ) : (
                    <>
                      <div className="p-3 rounded-full shadow-lg mb-3 group-hover:scale-110 transition-transform" style={{ background: 'var(--gradient-primary)' }}>
                        <CloudUpload size={28} className="text-white" />
                      </div>
                      <span className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Choose File</span>
                      <span className="text-xs mt-1 font-medium" style={{ color: 'var(--text-tertiary)' }}>Supports JPG, PNG</span>
                    </>
                  )}
                </div>
              </div>
              {formData.image && !isCompressing && (
                <button
                  onClick={() => setFormData({ ...formData, image: '' })}
                  className="mt-2 text-sm text-red-600 hover:underline flex items-center gap-1 font-medium"
                >
                  <X size={14} /> Remove Image
                </button>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowTransactionForm(false)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTransaction}
                disabled={isCompressing}
                className="btn-web3 px-6 py-2 disabled:opacity-50"
              >
                {editingTransaction
                  ? (editingTransaction._isPending ? 'Update Request' : (user.role === 'assistant' ? 'Request Update' : 'Update Transaction'))
                  : (user.role === 'assistant' ? 'Request Save' : 'Save Transaction')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Event) */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000]">
          <div className="glass-strong rounded-2xl p-8 w-[90%] max-w-[400px] shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-red-600" size={32} />
            </div>
            <h3 className="text-xl font-bold text-gradient-primary mb-2">{user.role === 'assistant' ? 'Request Delete?' : 'Delete Event?'}</h3>
            <p className="text-slate-300 mb-6">
              {user.role === 'assistant'
                ? `Send request to delete "${event.name}"? Admin approval required.`
                : `Are you sure you want to delete "${event.name}"? This action cannot be undone and all transactions will be lost.`}
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteEvent}
                className="px-4 py-2 btn-danger rounded-lg font-bold shadow-md"
              >
                {user.role === 'assistant' ? 'Send Request' : 'Yes, Delete It'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Transaction) */}
      {transactionToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[1000]">
          <div className="glass-strong rounded-2xl p-8 w-[90%] max-w-[400px] shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="text-red-600" size={32} />
            </div>
            <h3 className="text-xl font-bold text-gradient-primary mb-2">
              {transactionToDelete._isPending ? 'Cancel Request?' : (user.role === 'assistant' ? 'Request Delete?' : 'Delete Transaction?')}
            </h3>
            <p className="text-slate-300 mb-6">
              {transactionToDelete._isPending
                ? `Cancel your pending request for "${transactionToDelete.name}"?`
                : (user.role === 'assistant'
                  ? `Send request to delete "${transactionToDelete.name}"? Admin approval required.`
                  : `Are you sure you want to delete "${transactionToDelete.name}"? This action cannot be undone.`)}
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setTransactionToDelete(null)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTransaction}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold shadow-md"
              >
                {transactionToDelete._isPending ? 'Yes, Cancel Request' : (user.role === 'assistant' ? 'Send Request' : 'Yes, Delete It')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {showImageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[1100] p-4" onClick={() => setShowImageModal(null)}>
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setShowImageModal(null)}
          >
            <X size={32} />
          </button>
          <img
            src={showImageModal}
            alt="Full Preview"
            className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <a
            href={showImageModal}
            download="receipt_image.jpg"
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2 btn-primary px-6 py-3 rounded-full font-bold flex items-center gap-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Download size={18} /> Download
          </a>
        </div>
      )}
    </div>
  );
};