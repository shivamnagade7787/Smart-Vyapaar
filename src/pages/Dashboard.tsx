import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { TrendingUp, TrendingDown, Wallet, CreditCard, AlertCircle } from 'lucide-react';
import { startOfDay, endOfDay } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { user, uid, activeBusiness } = useAuth();
  const [stats, setStats] = useState({
    todaySales: 0,
    todayExpenses: 0,
    totalReceivable: 0,
    totalPayable: 0
  });
  const [cashFlow, setCashFlow] = useState({
    salesCash: 0, salesOnline: 0,
    expCash: 0, expOnline: 0,
    payCash: 0, payOnline: 0
  });
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);

  useEffect(() => {
    if (!uid) return;

    const todayStart = startOfDay(new Date()).toISOString();
    const todayEnd = endOfDay(new Date()).toISOString();

    // Listen to Sales
    const salesQ = query(collection(db, 'sales'), where('userId', '==', uid));
    const unsubSales = onSnapshot(salesQ, (snapshot) => {
      let todayTotal = 0;
      let cash = 0;
      let online = 0;
      const weeklyData: Record<string, number> = {};

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if ((data.businessId || 'Business 1') !== activeBusiness) return;
        
        if (data.date >= todayStart && data.date <= todayEnd) {
          todayTotal += data.finalAmount;
          if (data.paymentMode === 'cash') cash += data.finalAmount;
          if (['upi', 'bank'].includes(data.paymentMode)) online += data.finalAmount;
        }
        
        // Group for chart (last 7 days)
        const dateStr = new Date(data.date).toLocaleDateString('en-US', { weekday: 'short' });
        weeklyData[dateStr] = (weeklyData[dateStr] || 0) + data.finalAmount;
      });

      const chartData = Object.keys(weeklyData).map(key => ({ name: key, sales: weeklyData[key] }));

      setStats(prev => ({ ...prev, todaySales: todayTotal }));
      setCashFlow(prev => ({ ...prev, salesCash: cash, salesOnline: online }));
      setSalesData(chartData);
    });

    // Listen to Expenses
    const expQ = query(collection(db, 'expenses'), where('userId', '==', uid));
    const unsubExp = onSnapshot(expQ, (snapshot) => {
      let todayTotal = 0;
      let cash = 0;
      let online = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if ((data.businessId || 'Business 1') !== activeBusiness) return;

        if (data.date >= todayStart && data.date <= todayEnd) {
          todayTotal += data.amount;
          if (data.paymentMode === 'cash') cash += data.amount;
          if (['upi', 'bank'].includes(data.paymentMode)) online += data.amount;
        }
      });

      setStats(prev => ({ ...prev, todayExpenses: todayTotal }));
      setCashFlow(prev => ({ ...prev, expCash: cash, expOnline: online }));
    });

    // Listen to Payments
    const payQ = query(collection(db, 'payments'), where('userId', '==', uid));
    const unsubPay = onSnapshot(payQ, (snapshot) => {
      let cash = 0;
      let online = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if ((data.businessId || 'Business 1') !== activeBusiness) return;

        if (data.date >= todayStart && data.date <= todayEnd) {
          const amount = data.type === 'in' ? data.amount : -data.amount;
          if (data.paymentMode === 'cash') cash += amount;
          if (['upi', 'bank'].includes(data.paymentMode)) online += amount;
        }
      });

      setCashFlow(prev => ({ ...prev, payCash: cash, payOnline: online }));
    });

    // Listen to Parties for Receivables/Payables
    const partiesQ = query(collection(db, 'parties'), where('userId', '==', uid));
    const unsubParties = onSnapshot(partiesQ, (snapshot) => {
      let rec = 0;
      let pay = 0;
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if ((data.businessId || 'Business 1') !== activeBusiness) return;
        
        const bal = data.balance || 0;
        if (bal > 0) rec += bal;
        if (bal < 0) pay += Math.abs(bal);
      });
      setStats(prev => ({ ...prev, totalReceivable: rec, totalPayable: pay }));
    });

    // Listen to Products for Low Stock
    const prodQ = query(collection(db, 'products'), where('userId', '==', uid));
    const unsubProd = onSnapshot(prodQ, (snapshot) => {
      const lowStock: any[] = [];
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if ((data.businessId || 'Business 1') !== activeBusiness) return;

        if (data.stockQuantity <= (data.lowStockThreshold || 5)) {
          lowStock.push({ id: doc.id, ...data });
        }
      });
      setLowStockItems(lowStock);
    });

    return () => {
      unsubSales();
      unsubExp();
      unsubPay();
      unsubParties();
      unsubProd();
    };
  }, [user, activeBusiness]);

  const totalCashInHand = cashFlow.salesCash - cashFlow.expCash + cashFlow.payCash;
  const totalOnline = cashFlow.salesOnline - cashFlow.expOnline + cashFlow.payOnline;

  const StatCard = ({ title, amount, icon: Icon, colorClass }: any) => (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{formatCurrency(amount)}</h3>
        </div>
        <div className={cn("p-3 rounded-full", colorClass)}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Today's Sales" 
          amount={stats.todaySales} 
          icon={TrendingUp} 
          colorClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" 
        />
        <StatCard 
          title="Today's Expenses" 
          amount={stats.todayExpenses} 
          icon={TrendingDown} 
          colorClass="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" 
        />
        <StatCard 
          title="Cash in Hand (Today)" 
          amount={totalCashInHand} 
          icon={Wallet} 
          colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" 
        />
        <StatCard 
          title="Online Payments (Today)" 
          amount={totalOnline} 
          icon={CreditCard} 
          colorClass="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Sales Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#374151" opacity={0.2} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val}`} />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="sales" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Low Stock Alerts</h3>
          </div>
          <div className="space-y-4 overflow-y-auto max-h-72 pr-2">
            {lowStockItems.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">All items are sufficiently stocked.</p>
            ) : (
              lowStockItems.map(item => (
                <div key={item.id} className="flex justify-between items-center p-3 bg-orange-50 dark:bg-orange-900/10 rounded-lg border border-orange-100 dark:border-orange-900/30">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{item.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Stock: {item.stockQuantity}</p>
                  </div>
                  <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400 text-xs font-medium rounded-full">
                    Low
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Need to import cn
import { cn } from '../lib/utils';
