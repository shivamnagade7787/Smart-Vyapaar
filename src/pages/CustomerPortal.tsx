import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatCurrency } from '../lib/utils';
import { ArrowUpRight, ArrowDownRight, LogOut, Store } from 'lucide-react';

export default function CustomerPortal() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [customer, setCustomer] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [business, setBusiness] = useState<any>(null);

  useEffect(() => {
    const savedCustomer = localStorage.getItem('smartvyapaar_customer');
    if (savedCustomer) {
      const parsed = JSON.parse(savedCustomer);
      setCustomer(parsed);
      fetchCustomerData(parsed.id, parsed.businessId);
    }
  }, []);

  const fetchCustomerData = (customerId: string, businessId: string) => {
    const qTransactions = query(collection(db, 'credit_transactions'), where('customer_id', '==', customerId));
    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    });

    // Fetch business details for the name
    const qBusiness = query(collection(db, 'businesses'), where('name', '==', businessId));
    getDocs(qBusiness).then(snap => {
      if (!snap.empty) {
        setBusiness(snap.docs[0].data());
      }
    });

    return () => unsubTransactions();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const q = query(
        collection(db, 'credit_customers'), 
        where('username', '==', username),
        where('password', '==', password)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError('Invalid username or password');
      } else {
        const customerData = { id: snapshot.docs[0].id, ...(snapshot.docs[0].data() as any) };
        setCustomer(customerData);
        localStorage.setItem('smartvyapaar_customer', JSON.stringify(customerData));
        fetchCustomerData(customerData.id, customerData.businessId);
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCustomer(null);
    setTransactions([]);
    localStorage.removeItem('smartvyapaar_customer');
  };

  const getBalance = () => {
    let balance = 0;
    transactions.forEach(t => {
      if (t.type === 'CREDIT') balance += t.amount;
      if (t.type === 'DEBIT') balance -= t.amount;
    });
    return balance;
  };

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/50 rounded-2xl flex items-center justify-center">
              <Store className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">Customer Portal</h2>
          <p className="text-center text-gray-500 dark:text-gray-400 mb-8">Log in to view your Udhar balance</p>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-sm text-center">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
              <input 
                required 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Enter your username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
              <input 
                required 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                placeholder="Enter your password"
              />
            </div>
            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const balance = getBalance();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <h1 className="font-bold text-gray-900 dark:text-white">{business?.name || customer.businessId}</h1>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 text-center">
          <h2 className="text-lg text-gray-500 dark:text-gray-400 mb-2">Hello, {customer.name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Your Pending Balance</p>
          <p className={`text-4xl font-bold ${balance > 0 ? 'text-red-600 dark:text-red-400' : balance < 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
            {formatCurrency(Math.abs(balance))} {balance > 0 ? '(Due)' : balance < 0 ? '(Advance)' : ''}
          </p>
          {balance > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
              Please clear your pending dues at your earliest convenience.
            </p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white">Transaction History</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {transactions.map(txn => (
              <div key={txn.id} className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${txn.type === 'CREDIT' ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400'}`}>
                    {txn.type === 'CREDIT' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{txn.note || (txn.type === 'CREDIT' ? 'Goods Taken' : 'Payment Made')}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(txn.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className={`font-bold ${txn.type === 'CREDIT' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {txn.type === 'CREDIT' ? '+' : '-'}{formatCurrency(txn.amount)}
                </div>
              </div>
            ))}
            {transactions.length === 0 && (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No transactions found.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
