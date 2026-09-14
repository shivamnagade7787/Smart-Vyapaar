import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { Search, X, ArrowUpRight, ArrowDownRight, MessageCircle, ChevronRight, UserPlus, Trash2, Edit2 } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal';

export default function Credit() {
  const { user, uid, activeBusiness, upiId, businesses } = useAuth();
  const currentBusiness = businesses.find(b => b.name === activeBusiness);
  const [customers, setCustomers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', mobile: '', address: '' });
  
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [transactionForm, setTransactionForm] = useState({ amount: '', note: '', date: new Date().toISOString().split('T')[0] });
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'customer' | 'transaction', id: string } | null>(null);

  useEffect(() => {
    if (!uid) return;
    
    const qCustomers = query(collection(db, 'credit_customers'), where('userId', '==', uid));
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((d: any) => (d.businessId || 'Business 1') === activeBusiness));
    });

    const qTransactions = query(collection(db, 'credit_transactions'), where('userId', '==', uid));
    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((d: any) => (d.businessId || 'Business 1') === activeBusiness)
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    });

    return () => { unsubCustomers(); unsubTransactions(); };
  }, [user, activeBusiness]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;
    try {
      await addDoc(collection(db, 'credit_customers'), {
        userId: uid,
        businessId: activeBusiness,
        name: customerForm.name,
        mobile: customerForm.mobile,
        address: customerForm.address,
        created_at: new Date().toISOString()
      });
      setIsCustomerModalOpen(false);
      setCustomerForm({ name: '', mobile: '', address: '' });
    } catch (error) {
      console.error('Error adding customer:', error);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !selectedCustomer) return;
    try {
      if (editingTransaction) {
        await updateDoc(doc(db, 'credit_transactions', editingTransaction.id), {
          type: transactionType,
          amount: Number(transactionForm.amount),
          note: transactionForm.note,
          date: transactionForm.date,
        });
      } else {
        await addDoc(collection(db, 'credit_transactions'), {
          userId: uid,
          businessId: activeBusiness,
          customer_id: selectedCustomer.id,
          type: transactionType,
          amount: Number(transactionForm.amount),
          note: transactionForm.note,
          date: transactionForm.date,
          created_at: new Date().toISOString()
        });
      }
      setIsTransactionModalOpen(false);
      setEditingTransaction(null);
      setTransactionForm({ amount: '', note: '', date: new Date().toISOString().split('T')[0] });
    } catch (error) {
      console.error('Error saving transaction:', error);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete.type === 'customer') {
        // Delete all transactions for this customer first
        const customerTxns = transactions.filter(t => t.customer_id === itemToDelete.id);
        for (const txn of customerTxns) {
          await deleteDoc(doc(db, 'credit_transactions', txn.id));
        }
        await deleteDoc(doc(db, 'credit_customers', itemToDelete.id));
        setSelectedCustomer(null);
      } else if (itemToDelete.type === 'transaction') {
        await deleteDoc(doc(db, 'credit_transactions', itemToDelete.id));
      }
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const openEditTransaction = (txn: any) => {
    setEditingTransaction(txn);
    setTransactionType(txn.type);
    setTransactionForm({
      amount: String(txn.amount),
      note: txn.note || '',
      date: txn.date
    });
    setIsTransactionModalOpen(true);
  };

  const getCustomerBalance = (customerId: string) => {
    const customerTxns = transactions.filter(t => t.customer_id === customerId);
    let balance = 0;
    customerTxns.forEach(t => {
      if (t.type === 'CREDIT') balance += t.amount; // Took goods (Pending)
      if (t.type === 'DEBIT') balance -= t.amount;  // Paid money
    });
    return balance;
  };

  const sendWhatsAppReminder = (customer: any, balance: number) => {
    if (!customer.mobile) return;
    let message = `Hello / नमस्कार ${customer.name},\n\nThis is a friendly reminder that your pending balance is ${formatCurrency(balance)}. Please arrange for the payment at your earliest convenience.\n\nही एक नम्र आठवण आहे की तुमची थकीत रक्कम ${formatCurrency(balance)} आहे. कृपया लवकरात लवकर पेमेंट करण्याची व्यवस्था करा.\n\nThank you! / धन्यवाद!`;
    
    if (upiId) {
      const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(currentBusiness?.name || 'Business')}&am=${balance}&cu=INR`;
      message += `\n\nYou can pay directly using this UPI link / तुम्ही या UPI लिंकचा वापर करून थेट पेमेंट करू शकता:\n${upiLink}`;
    }
    
    window.open(`https://wa.me/${customer.mobile.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.mobile.includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Customer Credit (Udhar)</h2>
        <button 
          onClick={() => setIsCustomerModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="w-5 h-5" />
          Add Customer
        </button>
      </div>

      {!selectedCustomer ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input 
                type="text"
                placeholder="Search customers by name or mobile..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredCustomers.map(customer => {
              const balance = getCustomerBalance(customer.id);
              return (
                <div 
                  key={customer.id} 
                  onClick={() => setSelectedCustomer(customer)}
                  className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                >
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{customer.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{customer.mobile}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Pending Balance</p>
                      <p className={`font-bold ${balance > 0 ? 'text-red-600 dark:text-red-400' : balance < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                        {formatCurrency(Math.abs(balance))} {balance > 0 ? '(Due)' : balance < 0 ? '(Advance)' : ''}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              );
            })}
            {filteredCustomers.length === 0 && (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No customers found. Add a customer to start tracking Udhar.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedCustomer(null)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium"
            >
              ← Back to Customers
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedCustomer.name}</h3>
                <p className="text-gray-500 dark:text-gray-400">{selectedCustomer.mobile}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedCustomer.address}</p>
                <button 
                  onClick={() => setItemToDelete({ type: 'customer', id: selectedCustomer.id })}
                  className="mt-3 flex items-center gap-1 text-sm text-red-500 hover:text-red-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Account
                </button>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Pending Balance</p>
                <p className={`text-2xl font-bold ${getCustomerBalance(selectedCustomer.id) > 0 ? 'text-red-600 dark:text-red-400' : getCustomerBalance(selectedCustomer.id) < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
                  {formatCurrency(Math.abs(getCustomerBalance(selectedCustomer.id)))}
                </p>
                {getCustomerBalance(selectedCustomer.id) > 0 && (
                  <button 
                    onClick={() => sendWhatsAppReminder(selectedCustomer, getCustomerBalance(selectedCustomer.id))}
                    className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors text-sm font-medium ml-auto"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Send Reminder
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-4 mb-6">
              <button 
                onClick={() => { setTransactionType('CREDIT'); setIsTransactionModalOpen(true); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors font-medium"
              >
                <ArrowUpRight className="w-5 h-5" />
                Gave Goods (Udhar)
              </button>
              <button 
                onClick={() => { setTransactionType('DEBIT'); setIsTransactionModalOpen(true); }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400 rounded-xl hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors font-medium"
              >
                <ArrowDownRight className="w-5 h-5" />
                Got Payment
              </button>
            </div>

            <h4 className="font-bold text-gray-900 dark:text-white mb-4">Transaction History</h4>
            <div className="space-y-3">
              {transactions.filter(t => t.customer_id === selectedCustomer.id).map(txn => (
                <div key={txn.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700 group">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${txn.type === 'CREDIT' ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400'}`}>
                      {txn.type === 'CREDIT' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{txn.note || (txn.type === 'CREDIT' ? 'Goods Given' : 'Payment Received')}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(txn.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditTransaction(txn)} className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setItemToDelete({ type: 'transaction', id: txn.id })} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className={`font-bold ${txn.type === 'CREDIT' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {txn.type === 'CREDIT' ? '+' : '-'}{formatCurrency(txn.amount)}
                    </div>
                  </div>
                </div>
              ))}
              {transactions.filter(t => t.customer_id === selectedCustomer.id).length === 0 && (
                <p className="text-center text-gray-500 dark:text-gray-400 py-4">No transactions yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add Customer</h3>
              <button onClick={() => setIsCustomerModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddCustomer} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer Name *</label>
                <input required type="text" value={customerForm.name} onChange={e => setCustomerForm({...customerForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mobile Number</label>
                <input type="tel" value={customerForm.mobile} onChange={e => setCustomerForm({...customerForm, mobile: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                <textarea value={customerForm.address} onChange={e => setCustomerForm({...customerForm, address: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" rows={2}></textarea>
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingTransaction ? 'Edit Transaction' : (transactionType === 'CREDIT' ? 'Give Goods (Udhar)' : 'Accept Payment')}
              </h3>
              <button onClick={() => { setIsTransactionModalOpen(false); setEditingTransaction(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddTransaction} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount *</label>
                <input required type="number" min="0" step="0.01" value={transactionForm.amount} onChange={e => setTransactionForm({...transactionForm, amount: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                <input required type="date" value={transactionForm.date} onChange={e => setTransactionForm({...transactionForm, date: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Note / Details</label>
                <input type="text" placeholder={transactionType === 'CREDIT' ? 'e.g. 2 bags of cement' : 'e.g. Cash payment'} value={transactionForm.note} onChange={e => setTransactionForm({...transactionForm, note: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => { setIsTransactionModalOpen(false); setEditingTransaction(null); }} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className={`px-4 py-2 text-white rounded-lg transition-colors ${transactionType === 'CREDIT' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                  Save {transactionType === 'CREDIT' ? 'Udhar' : 'Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={!!itemToDelete}
        title={itemToDelete?.type === 'customer' ? "Delete Customer Account" : "Delete Transaction"}
        message={itemToDelete?.type === 'customer' 
          ? "Are you sure you want to delete this customer and ALL their transaction history? This action cannot be undone."
          : "Are you sure you want to delete this transaction? This action cannot be undone."}
        onConfirm={handleDelete}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
