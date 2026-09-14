import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, onSnapshot, writeBatch, runTransaction, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatCurrencyForPDF } from '../lib/utils';
import { Plus, Search, FileText, X, Trash2, MessageCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

import ConfirmModal from '../components/ConfirmModal';

export default function Sales() {
  const { user, uid, activeBusiness, upiId, qrCodeImage, billTemplate, invoiceFont, invoiceColor, logoPlacement, customFields } = useAuth();
  const featureFields = customFields.sales || [];
  const [sales, setSales] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    partyId: '',
    paymentMode: 'cash',
    discount: '0',
    manualTotalAmount: '',
    customData: {} as Record<string, any>
  });
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    if (!uid) return;
    
    const unsubSales = onSnapshot(query(collection(db, 'sales'), where('userId', '==', uid)), (snapshot) => {
      setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((d: any) => (d.businessId || 'Business 1') === activeBusiness)
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    });

    const unsubParties = onSnapshot(query(collection(db, 'parties'), where('userId', '==', uid)), (snapshot) => {
      setParties(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((d: any) => (d.businessId || 'Business 1') === activeBusiness));
    });

    const unsubProducts = onSnapshot(query(collection(db, 'products'), where('userId', '==', uid)), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((d: any) => (d.businessId || 'Business 1') === activeBusiness));
    });

    return () => { unsubSales(); unsubParties(); unsubProducts(); };
  }, [user, activeBusiness]);

  const handleAddItem = () => {
    setItems([...items, { productId: '', quantity: 1, price: 0 }]);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      newItems[index] = { ...newItems[index], productId: value, price: product?.sellingPrice || 0, name: product?.name || '' };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const totalAmount = items.length > 0 
    ? items.reduce((sum, item) => sum + (item.quantity * item.price), 0)
    : Number(formData.manualTotalAmount);
  const finalAmount = totalAmount - Number(formData.discount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!uid) return;

    if (items.length === 0 && !formData.manualTotalAmount) {
      setError("Please add items or enter a total amount.");
      return;
    }

    if (items.some(item => !item.productId)) {
      setError("Please select a product for all items.");
      return;
    }

    const party = parties.find(p => p.id === formData.partyId);
    
    const saleData = {
      userId: uid,
      businessId: activeBusiness,
      partyId: formData.partyId,
      partyName: party?.name || 'Walk-in Customer',
      totalAmount,
      discount: Number(formData.discount),
      finalAmount,
      paymentMode: formData.paymentMode,
      items,
      customData: formData.customData,
      date: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    try {
      await runTransaction(db, async (transaction) => {
        const settingsRef = doc(db, 'businessSettings', `${uid}_${activeBusiness}`);
        const settingsDoc = await transaction.get(settingsRef);
        let nextInvoiceNumber = 1;
        if (settingsDoc.exists()) {
          nextInvoiceNumber = settingsDoc.data().nextInvoiceNumber || 1;
        }

        const saleRef = doc(collection(db, 'sales'));
        const finalSaleData = {
          ...saleData,
          invoiceNumber: nextInvoiceNumber
        };

        transaction.set(saleRef, finalSaleData);
        transaction.set(settingsRef, { nextInvoiceNumber: nextInvoiceNumber + 1 }, { merge: true });

        // Update Inventory
        items.forEach(item => {
          if (item.productId) {
            const productRef = doc(db, 'products', item.productId);
            const product = products.find(p => p.id === item.productId);
            if (product) {
              transaction.update(productRef, { stockQuantity: product.stockQuantity - item.quantity });
            }
          }
        });

        // Update Party Balance if Credit
        if (formData.paymentMode === 'credit' && formData.partyId) {
          const partyRef = doc(db, 'parties', formData.partyId);
          if (party) {
            transaction.update(partyRef, { balance: party.balance + finalAmount });
          }
        }
      });
      
      setIsModalOpen(false);
      setFormData({ partyId: '', paymentMode: 'cash', discount: '0', manualTotalAmount: '', customData: {} });
      setItems([]);
    } catch (error) {
      console.error('Error saving sale:', error);
      setError('Failed to save sale. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (itemToDelete) {
      await deleteDoc(doc(db, 'sales', itemToDelete));
      setItemToDelete(null);
    }
  };

  const createInvoicePDF = async (sale: any) => {
    let format: string | number[] = 'a4';
    if (billTemplate === 'compact') format = 'a5';
    if (billTemplate === 'thermal80' || billTemplate === 'thermal') format = [80, 200];
    if (billTemplate === 'thermal58') format = [58, 200];

    const doc = new jsPDF({ format });
    const pageWidth = doc.internal.pageSize.width;
    const invoiceNo = sale.invoiceNumber ? sale.invoiceNumber.toString().padStart(4, '0') : (sale.id ? sale.id.slice(0, 6).toUpperCase() : Math.floor(Math.random() * 1000000).toString());
    const dateStr = new Date(sale.date).toLocaleDateString();

    // Apply Font
    doc.setFont(invoiceFont || 'helvetica');

    // Convert hex color to RGB array
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : [37, 99, 235]; // Default blue
    };
    const themeRgb = hexToRgb(invoiceColor || '#2563eb');

    let startY = 70;
    let theme = 'grid';
    let headStyles: any = undefined;
    let styles: any = { font: invoiceFont || 'helvetica' };
    let margin: any = undefined;

    // Helper for logo placement
    const getAlignX = (placement: string, leftX = 20, rightX = pageWidth - 20) => {
      if (placement === 'center') return pageWidth / 2;
      if (placement === 'right') return rightX;
      return leftX;
    };
    const getAlignStr = (placement: string) => {
      if (placement === 'center') return 'center';
      if (placement === 'right') return 'right';
      return 'left';
    };

    switch (billTemplate) {
      case 'modern':
        doc.setFillColor(themeRgb[0], themeRgb[1], themeRgb[2]);
        doc.rect(0, 0, pageWidth, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.text('INVOICE', 20, 25);
        doc.setFontSize(12);
        doc.text(activeBusiness, pageWidth - 20, 25, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        doc.text(`Invoice No: INV-${invoiceNo}`, pageWidth - 20, 50, { align: 'right' });
        doc.text(`Date: ${dateStr}`, pageWidth - 20, 58, { align: 'right' });
        doc.text(`Bill To:`, 20, 50);
        doc.setFontSize(14);
        doc.text(sale.partyName, 20, 58);
        startY = 70;
        theme = 'striped';
        headStyles = { fillColor: themeRgb };
        break;
      case 'bold':
        doc.setFillColor(themeRgb[0], themeRgb[1], themeRgb[2]);
        doc.rect(0, 0, pageWidth, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont(invoiceFont || "helvetica", "bold");
        doc.text('INVOICE', 20, 25);
        doc.setFontSize(14);
        doc.text(activeBusiness, pageWidth - 20, 25, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        doc.setFont(invoiceFont || "helvetica", "normal");
        doc.setFontSize(10);
        doc.text(`Invoice No: INV-${invoiceNo}`, pageWidth - 20, 50, { align: 'right' });
        doc.text(`Date: ${dateStr}`, pageWidth - 20, 56, { align: 'right' });
        doc.setFontSize(12);
        doc.text(`Bill To: ${sale.partyName}`, 20, 50);
        startY = 70;
        theme = 'grid';
        headStyles = { fillColor: themeRgb, textColor: [255, 255, 255] };
        break;
      case 'minimalist':
        doc.setFontSize(28);
        doc.setTextColor(100, 100, 100);
        doc.text('INVOICE', 20, 30);
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text(activeBusiness, pageWidth - 20, 30, { align: 'right' });
        doc.text(`Invoice No: INV-${invoiceNo}`, pageWidth - 20, 50, { align: 'right' });
        doc.text(`Date: ${dateStr}`, pageWidth - 20, 58, { align: 'right' });
        doc.text(`Bill To: ${sale.partyName}`, 20, 50);
        startY = 70;
        theme = 'plain';
        headStyles = { textColor: [100, 100, 100], fontStyle: 'bold' };
        break;
      case 'professional':
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        doc.rect(10, 10, pageWidth - 20, 35);
        doc.setFontSize(22);
        doc.text('TAX INVOICE', pageWidth / 2, 22, { align: 'center' });
        doc.setFontSize(12);
        doc.text(activeBusiness, pageWidth / 2, 32, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Invoice No: INV-${invoiceNo}`, 15, 42);
        doc.text(`Date: ${dateStr}`, pageWidth - 15, 42, { align: 'right' });
        doc.text(`Bill To: ${sale.partyName}`, 15, 55);
        startY = 65;
        theme = 'grid';
        headStyles = { fillColor: [240, 240, 240], textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.1 };
        styles = { lineColor: [0, 0, 0], lineWidth: 0.1 };
        break;
      case 'elegant':
        doc.setFont("times", "roman");
        doc.setFontSize(26);
        doc.text(activeBusiness, pageWidth / 2, 30, { align: 'center' });
        doc.setFontSize(14);
        doc.text('I N V O I C E', pageWidth / 2, 40, { align: 'center' });
        doc.setLineWidth(0.2);
        doc.line(40, 45, pageWidth - 40, 45);
        doc.setFontSize(11);
        doc.text(`Invoice No: INV-${invoiceNo}`, 20, 55);
        doc.text(`Date: ${dateStr}`, 20, 62);
        doc.text(`Bill To: ${sale.partyName}`, pageWidth - 20, 55, { align: 'right' });
        startY = 75;
        theme = 'plain';
        headStyles = { font: 'times', fontStyle: 'bold' };
        styles = { font: 'times' };
        break;
      case 'corporate':
        doc.setFillColor(245, 245, 245);
        doc.rect(0, 0, pageWidth, 45, 'F');
        doc.setFontSize(20);
        doc.setTextColor(50, 50, 50);
        doc.text('INVOICE', 20, 25);
        doc.setFontSize(10);
        doc.text(`Invoice No: INV-${invoiceNo}`, 20, 35);
        doc.text(`Date: ${dateStr}`, 20, 40);
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text(activeBusiness, pageWidth - 20, 25, { align: 'right' });
        doc.setFontSize(10);
        doc.text(`Bill To:`, 20, 60);
        doc.setFontSize(12);
        doc.text(sale.partyName, 20, 66);
        startY = 80;
        theme = 'striped';
        headStyles = { fillColor: [100, 100, 100] };
        break;
      case 'compact':
        doc.setFontSize(18);
        doc.text('INVOICE', pageWidth / 2, 15, { align: 'center' });
        doc.setFontSize(10);
        doc.text(activeBusiness, pageWidth / 2, 22, { align: 'center' });
        doc.text(`Invoice No: INV-${invoiceNo} | Date: ${dateStr}`, pageWidth / 2, 30, { align: 'center' });
        doc.text(`Bill To: ${sale.partyName}`, 10, 40);
        startY = 45;
        theme = 'grid';
        styles = { fontSize: 9, cellPadding: 2 };
        margin = { left: 10, right: 10 };
        break;
      case 'thermal80':
      case 'thermal':
        doc.setFontSize(16);
        doc.text(activeBusiness, pageWidth / 2, 15, { align: 'center' });
        doc.setFontSize(12);
        doc.text('RECEIPT', pageWidth / 2, 25, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Receipt No: INV-${invoiceNo}`, 5, 35);
        doc.text(`Date: ${dateStr}`, 5, 42);
        doc.text(`Customer: ${sale.partyName}`, 5, 49);
        startY = 55;
        theme = 'plain';
        styles = { fontSize: 8, cellPadding: 1 };
        margin = { left: 5, right: 5 };
        break;
      case 'thermal58':
        doc.setFontSize(14);
        doc.text(activeBusiness, pageWidth / 2, 12, { align: 'center' });
        doc.setFontSize(10);
        doc.text('RECEIPT', pageWidth / 2, 20, { align: 'center' });
        doc.setFontSize(8);
        doc.text(`Receipt No: INV-${invoiceNo}`, 3, 28);
        doc.text(`Date: ${dateStr}`, 3, 34);
        doc.text(`Customer: ${sale.partyName}`, 3, 40);
        startY = 45;
        theme = 'plain';
        styles = { fontSize: 7, cellPadding: 0.5 };
        margin = { left: 3, right: 3 };
        break;
      case 'standard':
      default:
        doc.setFontSize(20);
        doc.text('TAX INVOICE', pageWidth / 2, 20, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Invoice No: INV-${invoiceNo}`, pageWidth - 20, 30, { align: 'right' });
        doc.text(`Date: ${dateStr}`, pageWidth - 20, 36, { align: 'right' });
        doc.setFontSize(14);
        doc.text(activeBusiness, getAlignX(logoPlacement || 'left'), 40, { align: getAlignStr(logoPlacement || 'left') as any });
        doc.setFontSize(12);
        doc.text(`Bill To: ${sale.partyName}`, 20, 55);
        startY = 65;
        theme = 'grid';
        headStyles = { fillColor: themeRgb };
        break;
    }

    const tableData = sale.items.map((item: any) => [
      item.name,
      item.quantity,
      formatCurrencyForPDF(item.price),
      formatCurrencyForPDF(item.quantity * item.price)
    ]);

    autoTable(doc, {
      startY,
      head: [['Item', 'Qty', 'Price', 'Total']],
      body: tableData,
      foot: [
        ['', '', 'Subtotal', formatCurrencyForPDF(sale.totalAmount)],
        ['', '', 'Discount', formatCurrencyForPDF(sale.discount)],
        ['', '', 'Grand Total', formatCurrencyForPDF(sale.finalAmount)]
      ],
      theme: theme as any,
      headStyles,
      styles,
      margin,
    });

    const finalY = (doc as any).lastAutoTable.finalY || 150;
    const isThermal = billTemplate.includes('thermal');
    const qrSize = isThermal ? (billTemplate === 'thermal58' ? 25 : 30) : 40;
    const qrX = (pageWidth - qrSize) / 2;

    if (qrCodeImage) {
      doc.addImage(qrCodeImage, 'JPEG', qrX, finalY + 10, qrSize, qrSize);
      doc.setFontSize(10);
      doc.text('Scan to Pay', pageWidth / 2, finalY + 15 + qrSize, { align: 'center' });
    } else if (upiId) {
      try {
        const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(activeBusiness)}&am=${sale.finalAmount}&cu=INR`;
        const qrDataUrl = await QRCode.toDataURL(upiUrl);
        doc.addImage(qrDataUrl, 'PNG', qrX, finalY + 10, qrSize, qrSize);
        doc.setFontSize(10);
        doc.text('Scan to Pay via UPI', pageWidth / 2, finalY + 15 + qrSize, { align: 'center' });
      } catch (err) {
        console.error('Error generating QR code:', err);
      }
    }

    return doc;
  };

  const generateInvoice = async (sale: any) => {
    const doc = await createInvoicePDF(sale);
    doc.save(`Invoice_${sale.id}.pdf`);
  };

  const shareOnWhatsApp = async (sale: any) => {
    const party = parties.find(p => p.id === sale.partyId);
    const mobile = party?.mobile ? `91${party.mobile.replace(/\D/g, '')}` : '';
    const invoiceNo = sale.invoiceNumber ? sale.invoiceNumber.toString().padStart(4, '0') : (sale.id ? sale.id.slice(0, 6).toUpperCase() : 'N/A');
    
    let text = `Hello / नमस्कार ${sale.partyName},\n\nHere is your bill details from / कडून तुमच्या बिलाचा तपशील *${activeBusiness}*:\n\nInvoice No / बिल क्रमांक: *INV-${invoiceNo}*\nTotal Amount / एकूण रक्कम: *${formatCurrency(sale.finalAmount)}*\nDate / तारीख: ${new Date(sale.date).toLocaleDateString()}\n\n`;
    
    if (upiId) {
      text += `You can pay via UPI using this link / तुम्ही या UPI लिंकचा वापर करून पेमेंट करू शकता:\nupi://pay?pa=${upiId}&pn=${encodeURIComponent(activeBusiness)}&am=${sale.finalAmount}&cu=INR\n\n`;
    }
    
    text += `Thank you for your business! / आमच्याशी व्यवहार केल्याबद्दल धन्यवाद!`;

    try {
      const doc = await createInvoicePDF(sale);
      const blob = doc.output('blob');
      const file = new File([blob], `Invoice_${sale.id}.pdf`, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Invoice from ${activeBusiness}`,
          text: text
        });
      } else {
        doc.save(`Invoice_${sale.id}.pdf`);
        alert('Your receipt has been downloaded. Please attach it in WhatsApp.');
        const url = mobile ? `https://wa.me/${mobile}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Error sharing:', error);
      const url = mobile ? `https://wa.me/${mobile}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    }
  };

  const filteredSales = sales.filter(s => 
    s.partyName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Sales</h2>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Sale
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text"
              placeholder="Search by customer name..."
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
                <th className="p-4 font-medium">Invoice #</th>
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Customer</th>
                <th className="p-4 font-medium">Amount</th>
                <th className="p-4 font-medium">Mode</th>
                {featureFields.map(f => (
                  <th key={f.id} className="p-4 font-medium">{f.name}</th>
                ))}
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredSales.map(sale => (
                <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="p-4 text-gray-900 dark:text-white font-medium">
                    INV-{sale.invoiceNumber ? sale.invoiceNumber.toString().padStart(4, '0') : sale.id.slice(0, 6).toUpperCase()}
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-300">{new Date(sale.date).toLocaleDateString()}</td>
                  <td className="p-4 text-gray-900 dark:text-white font-medium">{sale.partyName}</td>
                  <td className="p-4 text-gray-900 dark:text-white font-medium">{formatCurrency(sale.finalAmount)}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-300 capitalize">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      sale.paymentMode === 'credit' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                      {sale.paymentMode}
                    </span>
                  </td>
                  <td className="p-4 flex items-center justify-end gap-2">
                    <button 
                      onClick={() => shareOnWhatsApp(sale)}
                      className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                      title="Share on WhatsApp"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => generateInvoice(sale)}
                      className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Download Invoice"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setItemToDelete(sale.id)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete Sale"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500 dark:text-gray-400">
                    No sales found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">New Sale</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg text-sm">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer</label>
                  <select value={formData.partyId} onChange={e => setFormData({...formData, partyId: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="">Walk-in Customer</option>
                    {parties.filter(p => p.type === 'customer').map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Payment Mode</label>
                  <select value={formData.paymentMode} onChange={e => setFormData({...formData, paymentMode: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Items</label>
                  <button type="button" onClick={handleAddItem} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    + Add Item
                  </button>
                </div>
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="flex gap-2 items-start">
                      <div className="flex-1">
                        <select required value={item.productId} onChange={e => handleItemChange(index, 'productId', e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                          <option value="">Select Product...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name} (Stock: {p.stockQuantity})</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <input required type="number" min="1" placeholder="Qty" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div className="w-32">
                        <input required type="number" min="0" step="0.01" placeholder="Price" value={item.price} onChange={e => handleItemChange(index, 'price', Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <button type="button" onClick={() => handleRemoveItem(index)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg mt-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
                      <p>No items added. Click "+ Add Item" to start.</p>
                      <p>OR</p>
                      <div className="max-w-xs mx-auto">
                        <label className="block text-left text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Enter Total Amount Manually</label>
                        <input 
                          type="number" 
                          min="0" 
                          step="0.01" 
                          placeholder="0.00" 
                          value={formData.manualTotalAmount} 
                          onChange={e => setFormData({...formData, manualTotalAmount: e.target.value})} 
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span>{formatCurrency(totalAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm text-gray-600 dark:text-gray-400">
                  <span>Discount</span>
                  <div className="w-32">
                    <input type="number" min="0" step="0.01" value={formData.discount} onChange={e => setFormData({...formData, discount: e.target.value})} className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-100 dark:border-gray-700">
                  <span>Total</span>
                  <span>{formatCurrency(finalAmount)}</span>
                </div>
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
            </div>

            <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/50">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSubmit} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Complete Sale</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal 
        isOpen={!!itemToDelete}
        title="Delete Sale"
        message="Are you sure you want to delete this sale? Inventory and party balances will NOT be automatically reverted."
        onConfirm={handleDelete}
        onCancel={() => setItemToDelete(null)}
      />
    </div>
  );
}
