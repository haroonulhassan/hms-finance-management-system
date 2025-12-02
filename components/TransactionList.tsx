
import React from 'react';
import { Transaction, UserRole } from '../types';
import { Image as ImageIcon, Trash2, Edit, Clock, RefreshCw, AlertCircle, Check, X } from 'lucide-react';

interface TransactionListProps {
  transactions: Transaction[];
  userRole: UserRole;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  onViewImage: (src: string) => void;
  onApprove?: (tx: Transaction) => void;
  onReject?: (tx: Transaction) => void;
}

export const TransactionList: React.FC<TransactionListProps> = ({
  transactions,
  userRole,
  onEdit,
  onDelete,
  onViewImage,
  onApprove,
  onReject
}) => {
  const [showAll, setShowAll] = React.useState(false);
  const INITIAL_LIMIT = 10;

  // Sort by date descending, and for same dates, preserve reverse order (last added = first shown)
  const indexed = transactions.map((tx, index) => ({ tx, index }));
  const sorted = indexed.sort((a, b) => {
    const dateA = new Date(a.tx.date).getTime();
    const dateB = new Date(b.tx.date).getTime();

    if (dateB !== dateA) {
      return dateB - dateA; // Sort by date descending
    }
    // If dates are equal, reverse the original order (higher index = added later = show first)
    return b.index - a.index;
  }).map(item => item.tx);

  const visibleTransactions = showAll ? sorted : sorted.slice(0, INITIAL_LIMIT);

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
      <table className="w-full border-separate border-spacing-y-2">
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
          {visibleTransactions.map((tx) => {
            // Styles for pending rows
            const isPending = tx._isPending;
            const rowClass = isPending
              ? 'bg-slate-700/30 hover:bg-slate-700/50 border-l-4 border-l-yellow-400 shadow-sm'
              : 'card-web3 bg-[rgba(242,242,249,0.49)] dark:bg-white/5 hover:bg-[rgba(242,242,249,0.49)] dark:hover:bg-white/10 transition-colors shadow-sm';


            return (
              <tr
                key={tx.id}
                className={`${rowClass} transition-colors rounded-lg ${!isPending ? 'bg-[#f5f5f5]' : ''}`}
              >
                <td className="p-4 font-medium text-[14px] first:rounded-l-lg last:rounded-r-lg" style={{ color: 'var(--text-primary)' }}>
                  <div className="flex items-center gap-2">
                    {tx._pendingAction === 'update' && (
                      <div className="bg-cyan-400/20 p-1 rounded" title="Update Request">
                        <RefreshCw size={14} className="text-cyan-400" />
                      </div>
                    )}
                    <div>
                      {new Date(tx.date).toLocaleDateString()}
                      {isPending && (
                        <div className="text-[10px] text-yellow-400 font-bold flex items-center gap-1 mt-1">
                          <Clock size={10} />
                          {tx._pendingAction === 'add' ? 'Pending Approval' :
                            tx._pendingAction === 'update' ? 'Update Pending' : 'Deletion Pending'}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="p-4 first:rounded-l-lg last:rounded-r-lg">
                  <div className="font-medium flex items-center gap-2 text-[14px]" style={{ color: 'var(--text-primary)' }}>
                    {tx._pendingAction === 'update' && tx._fullRequest?.data?.originalTransaction && tx._pendingData ? (
                      // Show change: Old → New
                      tx._fullRequest.data.originalTransaction.name !== tx._pendingData.name ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="line-through text-red-400 opacity-70">{tx._fullRequest.data.originalTransaction.name}</span>
                            <span className="text-cyan-400">→</span>
                            <span className="text-green-400 font-bold">{tx._pendingData.name}</span>
                          </div>
                        </div>
                      ) : (
                        tx.name
                      )
                    ) : (
                      tx.name
                    )}
                  </div>
                  {tx.description && <div className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{tx.description}</div>}
                </td>
                <td className="p-4 font-medium text-[14px] first:rounded-l-lg last:rounded-r-lg" style={{ color: 'var(--text-primary)' }}>
                  {tx._pendingAction === 'update' && tx._fullRequest?.data?.originalTransaction && tx._pendingData ? (
                    // Show change: Old → New
                    tx._fullRequest.data.originalTransaction.amount !== tx._pendingData.amount ? (
                      <div className="flex items-center gap-2">
                        <span className="line-through text-red-400 opacity-70">PKR {tx._fullRequest.data.originalTransaction.amount.toLocaleString()}</span>
                        <span className="text-cyan-400">→</span>
                        <span className="text-green-400 font-bold">PKR {tx._pendingData.amount.toLocaleString()}</span>
                      </div>
                    ) : (
                      `PKR ${tx.amount.toLocaleString()}`
                    )
                  ) : (
                    `PKR ${tx.amount.toLocaleString()}`
                  )}
                </td>
                <td className="p-4 first:rounded-l-lg last:rounded-r-lg">
                  {tx._pendingAction === 'update' && tx._fullRequest?.data?.originalTransaction && tx._pendingData ? (
                    // Show change: Old → New
                    tx._fullRequest.data.originalTransaction.type !== tx._pendingData.type ? (
                      <div className="flex flex-col gap-1">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider line-through opacity-70 ${getBadgeColor(tx._fullRequest.data.originalTransaction.type)}`}>
                          {tx._fullRequest.data.originalTransaction.type}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-cyan-400 text-xs">→</span>
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getBadgeColor(tx._pendingData.type)}`}>
                            {tx._pendingData.type}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getBadgeColor(tx.type)}`}>
                        {tx.type}
                      </span>
                    )
                  ) : (
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getBadgeColor(tx.type)}`}>
                      {tx.type}
                    </span>
                  )}
                </td>
                <td className="p-4 first:rounded-l-lg last:rounded-r-lg">
                  {tx._pendingAction === 'update' && tx._fullRequest?.data?.originalTransaction && tx._pendingData ? (
                    // Show both old and new images if changed
                    tx._fullRequest.data.originalTransaction.image !== tx._pendingData.image ? (
                      <div className="flex gap-2 items-center">
                        {tx._fullRequest.data.originalTransaction.image ? (
                          <div className="relative">
                            <img
                              src={tx._fullRequest.data.originalTransaction.image}
                              alt="Old Receipt"
                              className="w-8 h-8 object-cover rounded border border-red-400 cursor-pointer hover:scale-110 transition-all opacity-70"
                              onClick={() => onViewImage(tx._fullRequest.data.originalTransaction.image!)}
                            />
                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] rounded-full w-3 h-3 flex items-center justify-center">✕</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">None</span>
                        )}
                        <span className="text-cyan-400">→</span>
                        {tx._pendingData.image ? (
                          <div className="relative">
                            <img
                              src={tx._pendingData.image}
                              alt="New Receipt"
                              className="w-8 h-8 object-cover rounded border border-green-400 cursor-pointer hover:scale-110 transition-all"
                              onClick={() => onViewImage(tx._pendingData.image!)}
                            />
                            <div className="absolute -top-1 -right-1 bg-green-500 text-white text-[8px] rounded-full w-3 h-3 flex items-center justify-center">✓</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">None</span>
                        )}
                      </div>
                    ) : (
                      tx.image ? (
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
                      )
                    )
                  ) : (
                    tx.image ? (
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
                    )
                  )}
                </td>
                <td className="p-4 first:rounded-l-lg last:rounded-r-lg">
                  <div className="flex gap-2">
                    {(userRole === 'admin' || userRole === 'assistant') && (
                      <>
                        {/* Admin Approval Actions for Pending Items */}
                        {userRole === 'admin' && isPending && onApprove && onReject ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onApprove(tx);
                              }}
                              title="Approve Request"
                              className="p-2 btn-success rounded hover:scale-105 transition-all shadow-sm text-sm"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onReject(tx);
                              }}
                              title="Reject Request"
                              className="p-2 btn-danger rounded hover:scale-105 transition-all shadow-sm text-sm"
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          /* Standard Edit/Delete Actions */
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

      {sorted.length > INITIAL_LIMIT && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => setShowAll(!showAll)}
            className="btn-web3 px-6 py-2 text-sm font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
          >
            {showAll ? 'Show Less' : `Show All (${sorted.length})`}
          </button>
        </div>
      )}
    </div>
  );
};
