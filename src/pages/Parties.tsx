import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatCurrencyForPDF } from '../lib/utils';
import { Plus, Search, Edit2, Trash2, X, ArrowUpRight, ArrowDownRight, IndianRupee, Settings2 } from 'lucide-react';
import jsPDF from 'jspdf';
import QRCode from 'qrcode';

import ConfirmModal from '../components/ConfirmModal';
import CustomizeFieldsModal from '../components/CustomizeFieldsModal';

export default function Parties() {
  const { user, uid, activeBusiness, upiId, qrCodeImage, invoiceFont, customFields } = useAuth();
  const featureFields = customFields.parties || [];
  const [parties, setParties] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    address: '',
    type: 'customer',
    balance: '0',
    customData: {} as Record<string, any>
  });

  const [paymentData, setPaymentData] = useState({
    type: 'in',
    amount: '',
    paymentMode: 'cash',
    description: ''
  });

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'parties'), where('userId', '==', uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setParties(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter((d: any) => (d.businessId || 'Business 1') === activeBusiness));
    });
    return () => unsub();
  }, [user, activeBusiness]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid) return;

    const data = {
      userId: uid,
      businessId: activeBusiness,
      name: formData.name,
      mobile: formData.mobile,
      address: formData.address,
      type: formData.type,
      balance: Number(formData.balance),
      customData: formData.customData,
      createdAt: editingItem ? editingItem.createdAt : new Date().toISOString()
    };

    try {
      if (editingItem) {
        await updateDoc(doc(db, 'parties', editingItem.id), data);
      } else {
        await addDoc(collection(db, 'parties'), data);
      }
      setIsModalOpen(false);
      setEditingItem(null);
      setFormData({ name: '', mobile: '', address: '', type: 'customer', balance: '0', customData: {} });
    } catch (error) {
      console.error('Error saving party:', error);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedParty) return;

    const amount = Number(paymentData.amount);
    // If payment 'in' (received from customer), balance decreases (they owe us less)
    // If payment 'out' (paid to supplier), balance increases (we owe them less, so balance goes towards positive)
    const balanceChange = paymentData.type === 'in' ? -amount : amount;
    const newBalance = selectedParty.balance + balanceChange;

    try {
      const batch = writeBatch(db);
      
      // Update party balance
      const partyRef = doc(db, 'parties', selectedParty.id);
      batch.update(partyRef, { balance: newBalance });

      // Record payment
      const paymentRef = doc(collection(db, 'payments'));
      batch.set(paymentRef, {
        userId: uid,
        businessId: activeBusiness,
        partyId: selectedParty.id,
        partyName: selectedParty.name,
        type: paymentData.type,
        amount,
        paymentMode: paymentData.paymentMode,
        description: paymentData.description,
        date: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });

      await batch.commit();
      
      setIsPaymentModalOpen(false);
      setSelectedParty(null);
      setPaymentData({ type: 'in', amount: '', paymentMode: 'cash', description: '' });
    } catch (error) {
      console.error('Error saving payment:', error);
    }
  };

  const handleDelete = async () => {
    if (itemToDelete) {
      await deleteDoc(doc(db, 'parties', itemToDelete));
      setItemToDelete(null);
    }
  };

  const filteredParties = parties.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.mobile?.includes(search)
  );

  const createReminderPDF = async (party: any) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const dateStr = new Date().toLocaleDateString();
    const refNo = party.id ? party.id.slice(0, 6).toUpperCase() : Math.floor(Math.random() * 1000000).toString();

    doc.setFont(invoiceFont || 'helvetica');

    doc.setFontSize(24);
    doc.text('PAYMENT REMINDER', pageWidth / 2, 30, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${dateStr}`, pageWidth - 20, 25, { align: 'right' });
    doc.text(`Ref No: PR-${refNo}`, pageWidth - 20, 32, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(14);
    doc.text(`From: ${activeBusiness}`, 20, 50);
    doc.text(`To: ${party.name}`, 20, 60);
    
    doc.setFontSize(18);
    doc.setTextColor(220, 38, 38);
    doc.text(`Pending Amount: ${formatCurrencyForPDF(party.balance)}`, pageWidth / 2, 90, { align: 'center' });
    doc.setTextColor(0, 0, 0);

    const qrSize = 60;
    const qrX = (pageWidth - qrSize) / 2;
    const finalY = 110;

    if (qrCodeImage) {
      doc.addImage(qrCodeImage, 'JPEG', qrX, finalY, qrSize, qrSize);
      doc.setFontSize(12);
      doc.text('Scan to Pay', pageWidth / 2, finalY + qrSize + 10, { align: 'center' });
    } else if (upiId) {
      try {
        const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(activeBusiness)}&am=${party.balance}&cu=INR`;
        const qrDataUrl = await QRCode.toDataURL(upiUrl);
        doc.addImage(qrDataUrl, 'PNG', qrX, finalY, qrSize, qrSize);
        doc.setFontSize(12);
        doc.text('Scan to Pay via UPI', pageWidth / 2, finalY + qrSize + 10, { align: 'center' });
      } catch (err) {
        console.error('Error generating QR code:', err);
      }
    }

    return doc;
  };

  const shareReminderOnWhatsApp = async (party: any) => {
    let text = `Hi ${party.name}, this is a gentle reminder for your pending payment of ${formatCurrency(party.balance)} to *${activeBusiness}*. Please clear it at your earliest convenience.\n\n`;
    if (upiId) {
      text += `You can pay via UPI using this link:\nupi://pay?pa=${upiId}&pn=${encodeURIComponent(activeBusiness)}&am=${party.balance}&cu=INR\n\n`;
    }
    text += `Thank you!`;
    
    let mobile = party.mobile ? party.mobile.replace(/\D/g, '') : '';
    if (mobile.length === 10) mobile = `91${mobile}`;

    try {
      const doc = await createReminderPDF(party);
      const blob = doc.output('blob');
      const file = new File([blob], `Payment_Reminder_${party.name}.pdf`, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Payment Reminder from ${activeBusiness}`,
          text: text
        });
      } else {
        doc.save(`Payment_Reminder_${party.name}.pdf`);
        alert('Reminder PDF downloaded. Please attach it in WhatsApp.');
        const url = mobile ? `https://wa.me/${mobile}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      const url = mobile ? `https://wa.me/${mobile}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Parties</h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsCustomizeOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Settings2 className="w-5 h-5" />
            Customize Fields
          </button>
          <button 
            onClick={() => { setEditingItem(null); setIsModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Party
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text"
              placeholder="Search by name or mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-sm">
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Mobile</th>
                <th className="p-4 font-medium">Balance</th>
                {featureFields.map(f => (
                  <th key={f.id} className="p-4 font-medium">{f.name}</th>
                ))}
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredParties.map(party => (
                <tr key={party.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="p-4 text-gray-900 dark:text-white font-medium">{party.name}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-300 capitalize">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      party.type === 'customer' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                    }`}>
                      {party.type}
                    </span>
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-300">{party.mobile || '-'}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      {party.balance > 0 ? (
                        <span className="text-green-600 dark:text-green-400 flex items-center font-medium">
                          <ArrowDownRight className="w-4 h-4 mr-1" />
                          {formatCurrency(party.balance)}
                        </span>
                      ) : party.balance < 0 ? (
                        <span className="text-red-600 dark:text-red-400 flex items-center font-medium">
                          <ArrowUpRight className="w-4 h-4 mr-1" />
                          {formatCurrency(Math.abs(party.balance))}
                        </span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400 font-medium">₹0.00</span>
                      )}
                    </div>
                  </td>
                  {featureFields.map(f => (
                    <td key={f.id} className="p-4 text-gray-600 dark:text-gray-300">
                      {party.customData?.[f.id] || '-'}
                    </td>
                  ))}
                  <td className="p-4 flex items-center justify-end gap-2">
                    <button 
                      onClick={() => {
                        setSelectedParty(party);
                        setPaymentData({ ...paymentData, type: party.type === 'customer' ? 'in' : 'out' });
                        setIsPaymentModalOpen(true);
                      }}
                      className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                      title="Record Payment"
                    >
                      <IndianRupee className="w-4 h-4" />
                    </button>
                    {party.balance > 0 && party.mobile && (
                      <button 
                        onClick={() => shareReminderOnWhatsApp(party)}
                        className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                        title="Send WhatsApp Reminder"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setEditingItem(party);
                        setFormData({
                          name: party.name,
                          mobile: party.mobile || '',
                          address: party.address || '',
                          type: party.type,
                          balance: String(party.balance),
                          customData: party.customData || {}
                        });
                        setIsModalOpen(true);
                      }}
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setItemToDelete(party.id)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredParties.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500 dark:text-gray-400">
                    No parties found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Record Payment - {selectedParty.name}
              </h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handlePaymentSubmit} className="p-4 space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Current Balance</p>
                <p className={`text-lg font-bold ${selectedParty.balance > 0 ? 'text-green-600 dark:text-green-400' : selectedParty.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                  {selectedParty.balance > 0 ? `${formatCurrency(selectedParty.balance)} (Receivable)` : selectedParty.balance < 0 ? `${formatCurrency(Math.abs(selectedParty.balance))} (Payable)` : '₹0.00'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Type</label>
                  <select value={paymentData.type} onChange={e => setPaymentData({...paymentData, type: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="in">Payment In (Received)</option>
                    <option value="out">Payment Out (Given)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Mode</label>
                  <select value={paymentData.paymentMode} onChange={e => setPaymentData({...paymentData, paymentMode: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount</label>
                <input required type="number" min="0" step="0.01" value={paymentData.amount} onChange={e => setPaymentData({...paymentData, amount: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description (Optional)</label>
                <textarea rows={2} value={paymentData.description} onChange={e => setPaymentData({...paymentData, description: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Save Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Party Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingItem ? 'Edit Party' : 'Add Party'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Party Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                  <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="customer">Customer</option>
                    <option value="supplier">Supplier</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mobile</label>
                  <input type="tel" value={formData.mobile} onChange={e => setFormData({...formData, mobile: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Opening Balance</label>
                <input required type="number" step="0.01" value={formData.balance} onChange={e => setFormData({...formData, balance: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="text-xs text-gray-500 mt-1">Positive = Receivable (They owe you), Negative = Payable (You owe them)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address</label>
                <textarea rows={2} value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>

              {featureFields.length > 0 && (
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">Custom Fields</h4>
                  {featureFields.map(field => (
                    <div key={field.id}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{field.name}</label>
                      <input 
                        type={field.type === 'number' ? 'number' : 'text'} 
                        value={formData.customData[field.id] || ''} 
                        onChange={e => setFormData({...formData, customData: {...formData.customData, [field.id]: e.target.value}})} 
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save Party</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={!!itemToDelete}
        title="Delete Party"
        message="Are you sure you want to delete this party? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setItemToDelete(null)}
      />

      <CustomizeFieldsModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        feature="parties"
      />
    </div>
  );
}
