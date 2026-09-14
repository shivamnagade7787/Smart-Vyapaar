import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { FileText, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { startOfMonth, endOfMonth, format, subMonths, subYears } from 'date-fns';

export default function Reports() {
  const { user, uid, activeBusiness } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('sales');
  const [dateRange, setDateRange] = useState('thisMonth');
  const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [data, setData] = useState<any[]>([]);
  const [summary, setSummary] = useState({ total: 0, count: 0 });

  useEffect(() => {
    if (dateRange !== 'custom') {
      fetchData();
    }
  }, [reportType, dateRange, user, activeBusiness]);

  useEffect(() => {
    if (dateRange === 'custom') {
      fetchData();
    }
  }, [customStartDate, customEndDate]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    
    let startDate = new Date();
    let endDate = new Date();
    
    if (dateRange === 'thisMonth') {
      startDate = startOfMonth(new Date());
      endDate = endOfMonth(new Date());
    } else if (dateRange === 'lastMonth') {
      startDate = startOfMonth(new Date(new Date().setMonth(new Date().getMonth() - 1)));
      endDate = endOfMonth(new Date(new Date().setMonth(new Date().getMonth() - 1)));
    } else if (dateRange === 'today') {
      startDate.setHours(0,0,0,0);
      endDate.setHours(23,59,59,999);
    } else if (dateRange === '3m') {
      startDate = subMonths(new Date(), 3);
    } else if (dateRange === '6m') {
      startDate = subMonths(new Date(), 6);
    } else if (dateRange === '1y') {
      startDate = subYears(new Date(), 1);
    } else if (dateRange === 'custom') {
      startDate = new Date(customStartDate);
      startDate.setHours(0,0,0,0);
      endDate = new Date(customEndDate);
      endDate.setHours(23,59,59,999);
    }

    const startStr = startDate.toISOString();
    const endStr = endDate.toISOString();

    try {
      let collectionName = reportType;
      if (reportType === 'udhar') collectionName = 'credit_transactions';
      if (reportType === 'items') collectionName = 'products';

      let q;
      if (reportType === 'parties' || reportType === 'items') {
        // These collections might not have 'date' field, use 'createdAt' or just filter by user
        q = query(
          collection(db, collectionName), 
          where('userId', '==', uid)
        );
      } else {
        q = query(
          collection(db, collectionName), 
          where('userId', '==', uid),
          where('date', '>=', startStr),
          where('date', '<=', endStr)
        );
      }
      
      const snapshot = await getDocs(q);
      let docs = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })).filter((d: any) => (d.businessId || 'Business 1') === activeBusiness);
      
      if (reportType === 'parties' || reportType === 'items') {
        // Filter by date manually if they have createdAt
        docs = docs.filter((d: any) => {
          const dDate = new Date(d.createdAt || d.created_at || new Date());
          return dDate >= startDate && dDate <= endDate;
        });
      }

      setData(docs);
      
      if (reportType === 'sales' || reportType === 'purchases') {
        setSummary({
          total: docs.reduce((sum, d: any) => sum + (d.finalAmount || 0), 0),
          count: docs.length
        });
      } else if (reportType === 'expenses') {
        setSummary({
          total: docs.reduce((sum, d: any) => sum + (d.amount || 0), 0),
          count: docs.length
        });
      } else if (reportType === 'udhar') {
        setSummary({
          total: docs.reduce((sum, d: any) => sum + (d.amount || 0), 0),
          count: docs.length
        });
      } else {
        setSummary({
          total: 0,
          count: docs.length
        });
      }
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text(`${reportType.toUpperCase()} REPORT`, 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Period: ${dateRange}`, 20, 30);
    doc.text(`Total ${reportType.toUpperCase()}: ${['parties', 'items'].includes(reportType) ? summary.count : formatCurrency(summary.total)}`, 20, 40);
    doc.text(`Total Records: ${summary.count}`, 20, 50);

    let head = [];
    let body = [];

    if (reportType === 'sales' || reportType === 'purchases') {
      head = [['Date', 'Party', 'Mode', 'Amount']];
      body = data.map(d => [
        format(new Date(d.date), 'dd MMM yyyy'),
        d.partyName || '-',
        d.paymentMode || '-',
        formatCurrency(d.finalAmount || 0)
      ]);
    } else if (reportType === 'expenses') {
      head = [['Date', 'Category', 'Mode', 'Amount']];
      body = data.map(d => [
        format(new Date(d.date), 'dd MMM yyyy'),
        d.category || '-',
        d.paymentMode || '-',
        formatCurrency(d.amount || 0)
      ]);
    } else if (reportType === 'udhar') {
      head = [['Date', 'Type', 'Note', 'Amount']];
      body = data.map(d => [
        format(new Date(d.date), 'dd MMM yyyy'),
        d.type || '-',
        d.note || '-',
        formatCurrency(d.amount || 0)
      ]);
    } else if (reportType === 'parties') {
      head = [['Name', 'Type', 'Mobile', 'Balance']];
      body = data.map(d => [
        d.name || '-',
        d.type || '-',
        d.mobile || '-',
        formatCurrency(d.openingBalance || 0)
      ]);
    } else if (reportType === 'items') {
      head = [['Name', 'Category', 'Stock', 'Price']];
      body = data.map(d => [
        d.name || '-',
        d.category || '-',
        d.stockQuantity || 0,
        formatCurrency(d.sellingPrice || 0)
      ]);
    }

    autoTable(doc, {
      startY: 60,
      head,
      body,
      theme: 'grid'
    });

    doc.save(`${reportType}_report_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h2>
        <button 
          onClick={downloadPDF}
          disabled={data.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Download className="w-5 h-5" />
          Download PDF
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Report Type</label>
            <select value={reportType} onChange={e => setReportType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="sales">Sales Report</option>
              <option value="purchases">Purchase Report</option>
              <option value="expenses">Expense Report</option>
              <option value="udhar">Udhar Report</option>
              <option value="parties">Parties Report</option>
              <option value="items">Items Report</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date Range</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="today">Today</option>
              <option value="thisMonth">This Month</option>
              <option value="lastMonth">Last Month</option>
              <option value="3m">Last 3 Months</option>
              <option value="6m">Last 6 Months</option>
              <option value="1y">Annual (1 Year)</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>
        </div>

        {dateRange === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
              <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
              <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/30">
            <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">{['parties', 'items'].includes(reportType) ? 'Total Records' : 'Total Amount'}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{['parties', 'items'].includes(reportType) ? summary.count : formatCurrency(summary.total)}</p>
          </div>
          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-900/30">
            <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">{['parties', 'items'].includes(reportType) ? 'Active' : 'Transactions'}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{summary.count}</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading data...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-sm">
                  {reportType === 'parties' ? (
                    <>
                      <th className="p-4 font-medium">Name</th>
                      <th className="p-4 font-medium">Type</th>
                      <th className="p-4 font-medium">Mobile</th>
                      <th className="p-4 font-medium text-right">Balance</th>
                    </>
                  ) : reportType === 'items' ? (
                    <>
                      <th className="p-4 font-medium">Name</th>
                      <th className="p-4 font-medium">Category</th>
                      <th className="p-4 font-medium">Stock</th>
                      <th className="p-4 font-medium text-right">Selling Price</th>
                    </>
                  ) : reportType === 'udhar' ? (
                    <>
                      <th className="p-4 font-medium">Date</th>
                      <th className="p-4 font-medium">Type</th>
                      <th className="p-4 font-medium">Note</th>
                      <th className="p-4 font-medium text-right">Amount</th>
                    </>
                  ) : (
                    <>
                      <th className="p-4 font-medium">Date</th>
                      <th className="p-4 font-medium">{reportType === 'sales' || reportType === 'purchases' ? 'Party' : 'Category'}</th>
                      <th className="p-4 font-medium">Mode</th>
                      <th className="p-4 font-medium text-right">Amount</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {data.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    {reportType === 'parties' ? (
                      <>
                        <td className="p-4 text-gray-900 dark:text-white font-medium">{item.name}</td>
                        <td className="p-4 text-gray-600 dark:text-gray-300">{item.type}</td>
                        <td className="p-4 text-gray-600 dark:text-gray-300">{item.mobile}</td>
                        <td className="p-4 text-gray-900 dark:text-white font-medium text-right">{formatCurrency(item.openingBalance || 0)}</td>
                      </>
                    ) : reportType === 'items' ? (
                      <>
                        <td className="p-4 text-gray-900 dark:text-white font-medium">{item.name}</td>
                        <td className="p-4 text-gray-600 dark:text-gray-300">{item.category || '-'}</td>
                        <td className="p-4 text-gray-600 dark:text-gray-300">{item.stockQuantity}</td>
                        <td className="p-4 text-gray-900 dark:text-white font-medium text-right">{formatCurrency(item.sellingPrice || 0)}</td>
                      </>
                    ) : reportType === 'udhar' ? (
                      <>
                        <td className="p-4 text-gray-600 dark:text-gray-300">{format(new Date(item.date), 'dd MMM yyyy')}</td>
                        <td className="p-4 text-gray-900 dark:text-white font-medium">{item.type}</td>
                        <td className="p-4 text-gray-600 dark:text-gray-300">{item.note || '-'}</td>
                        <td className="p-4 text-gray-900 dark:text-white font-medium text-right">{formatCurrency(item.amount)}</td>
                      </>
                    ) : (
                      <>
                        <td className="p-4 text-gray-600 dark:text-gray-300">{format(new Date(item.date), 'dd MMM yyyy')}</td>
                        <td className="p-4 text-gray-900 dark:text-white font-medium">{reportType === 'sales' || reportType === 'purchases' ? item.partyName : item.category}</td>
                        <td className="p-4 text-gray-600 dark:text-gray-300 capitalize">{item.paymentMode}</td>
                        <td className="p-4 text-gray-900 dark:text-white font-medium text-right">
                          {formatCurrency(reportType === 'sales' || reportType === 'purchases' ? item.finalAmount : item.amount)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500 dark:text-gray-400">
                      No data found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
