
import React from 'react';
import { Transaction, UserRole } from '../types';
import { Image as ImageIcon, Trash2, Edit, Clock, RefreshCw, AlertCircle } from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
  userRole: UserRole;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onViewImage: (src: string) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  userRole,
  onEdit,
  onDelete,
  onViewImage
}) => {
  // Sort by date descending, but ensure we don't break if date is missing (though it shouldn't be)
  const sorted = [...transactions].sort((a, b) => {
    // Prioritize pending adds at the top if needed, or just by date
    // Let's stick to date
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const getBadgeColor = (type: string) => {
    switch (type) {
      case 'collection': return 'bg-[rgba(76,201,240,0.2)] text-[#4cc9f0]'; // Success/Cyan
      case 'expense': return 'bg-[rgba(220,38,38,0.2)] text-[#ef4444]'; // Red
      case 'loan': return 'bg-[rgba(248,150,30,0.2)] text-[#f8961e]'; // Warning/Orange
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="p-4 text-left font-semibold border-b text-sm" style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}>Date</th>
            <th className="p-4 text-left font-semibold border-b text-sm" style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}>Title</th>
            <th className="p-4 text-left font-semibold border-b text-sm" style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}>Amount</th>
            <th className="p-4 text-left font-semibold border-b text-sm" style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}>Type</th>
            <th className="p-4 text-left font-semibold border-b text-sm" style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}>Image</th>
            <th className="p-4 text-left font-semibold border-b text-sm" style={{ background: 'var(--glass-bg)', borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((tx) => {
            // Styles for pending rows
            const isPending = tx._isPending;
            const rowClass = isPending
              ? 'bg-yellow-50 hover:bg-yellow-100 border-l-4 border-l-yellow-400'
              : 'border-b hover:bg-white/5 transition-colors';


            return (
              <tr key={tx.id} className={`${rowClass} transition-colors`}>
                <td className="p-4 font-medium text-[14px]" style={{ color: 'var(--text-primary)' }}>
                  {new Date(tx.date).toLocaleDateString()}
                  {isPending && (
                    <div className="text-[10px] text-yellow-700 font-bold flex items-center gap-1 mt-1">
                      <Clock size={10} />
                      {tx._pendingAction === 'add' ? 'Pending Approval' :
                        tx._pendingAction === 'update' ? 'Update Pending' : 'Deletion Pending'}
                    </div>
                  )}
                </td>
                <td className="p-4">
                  <div className="font-medium flex items-center gap-2 text-[14px]" style={{ color: 'var(--text-primary)' }}>
                    {tx.name}
                  </div>
                  {tx.description && <div className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{tx.description}</div>}
                </td>
                <td className="p-4 font-medium text-[14px]" style={{ color: 'var(--text-primary)' }}>
                  PKR {tx.amount.toLocaleString()}
                </td>
                <td className="p-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getBadgeColor(tx.type)}`}>
                    {tx.type}
                  </span>
                </td>
                <td className="p-4">
                  {tx.image ? (
                    <img
                      src={tx.image}
                      alt="Receipt"
                      className="w-8 h-8 object-cover rounded border border-gray-200 cursor-pointer hover:scale-110 hover:shadow-md transition-all"
                      onClick={() => onViewImage(tx.image!)}
                    />
                  ) : (
                    <span className="text-gray-300 flex items-center gap-1">
                      <ImageIcon size={14} />
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    {(userRole === 'admin' || userRole === 'assistant') && (
                      <>
                        {/* Edit Button */}
                        {tx._pendingAction !== 'delete' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(tx);
                            }}
                            title={isPending ? "Edit Request" : "Edit Transaction"}
                            className="p-2 btn-primary rounded hover:scale-105 transition-all shadow-sm text-sm"
                          >
                            <Edit size={16} />
                          </button>
                        )}

                        {/* Delete Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(tx);
                          }}
                          title={isPending ? "Cancel Request" : "Delete Transaction"}
                          className="p-2 btn-danger rounded hover:scale-105 transition-all shadow-sm text-sm"
                        >
                          {isPending ? <Trash2 size={16} /> : <Trash2 size={16} />}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6} className="p-8 text-center text-[#6c757d] text-[14px]">No transactions found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
