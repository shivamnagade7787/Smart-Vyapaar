import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency } from '../lib/utils';
import { Plus, Search, Trash2, Camera, X, Image as ImageIcon, Eye, Settings2 } from 'lucide-react';

import ConfirmModal from '../components/ConfirmModal';
import CustomizeFieldsModal from '../components/CustomizeFieldsModal';

export default function Purchases() {
  const { user, uid, activeBusiness, customFields } = useAuth();
  const featureFields = customFields.purchases || [];
  const [purchases, setPurchases] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [viewImage, setViewImage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    supplierName: '',
    supplierNumber: '',
    amount: '',
    description: '',
    billImage: null as string | null,
    customData: {} as Record<string, any>
  });

  useEffect(() => {
    if (!uid || !activeBusiness) return;

    const q = query(
      collection(db, 'purchases'),
      where('userId', '==', uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const purchasesData = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter((d: any) => (d.businessName || 'Business 1') === activeBusiness);
        
      // Sort in memory since we don't have a composite index for date
      purchasesData.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPurchases(purchasesData);
    });

    return () => unsubscribe();
  }, [user, activeBusiness]);

  const handleImageCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 1024; // Max width/height to compress image
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Compress to JPEG with 0.7 quality
            setFormData(prev => ({ ...prev, billImage: canvas.toDataURL('image/jpeg', 0.7) }));
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeBusiness) return;

    try {
      await addDoc(collection(db, 'purchases'), {
        ...formData,
        amount: Number(formData.amount),
        date: new Date().toISOString(),
        userId: uid,
        businessName: activeBusiness
      });
      
      setIsModalOpen(false);
      setFormData({ supplierName: '', supplierNumber: '', amount: '', description: '', billImage: null, customData: {} });
    } catch (error) {
      console.error('Error adding purchase:', error);
    }
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      await deleteDoc(doc(db, 'purchases', itemToDelete));
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting purchase:', error);
    }
  };

  const filteredPurchases = purchases.filter(p => 
    p.supplierName.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Purchases</h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsCustomizeOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Settings2 className="w-5 h-5" />
            Customize Fields
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Purchase
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text"
              placeholder="Search by supplier or description..."
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
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Supplier</th>
                <th className="p-4 font-medium">Description</th>
                <th className="p-4 font-medium">Amount</th>
                <th className="p-4 font-medium text-center">Bill</th>
                {featureFields.map(f => (
                  <th key={f.id} className="p-4 font-medium">{f.name}</th>
                ))}
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredPurchases.map(purchase => (
                <tr key={purchase.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="p-4 text-gray-600 dark:text-gray-300">{new Date(purchase.date).toLocaleDateString()}</td>
                  <td className="p-4 text-gray-900 dark:text-white font-medium">
                    <div>{purchase.supplierName}</div>
                    {purchase.supplierNumber && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 font-normal">{purchase.supplierNumber}</div>
                    )}
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-300">{purchase.description || '-'}</td>
                  <td className="p-4 text-gray-900 dark:text-white font-medium">{formatCurrency(purchase.amount)}</td>
                  <td className="p-4 text-center">
                    {purchase.billImage ? (
                      <button 
                        onClick={() => setViewImage(purchase.billImage)}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors text-xs font-medium"
                      >
                        <Eye className="w-3 h-3" />
                        View Bill
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">No Bill</span>
                    )}
                  </td>
                  {featureFields.map(f => (
                    <td key={f.id} className="p-4 text-gray-600 dark:text-gray-300">
                      {purchase.customData?.[f.id] || '-'}
                    </td>
                  ))}
                  <td className="p-4 flex items-center justify-end gap-2">
                    <button 
                      onClick={() => setItemToDelete(purchase.id)}
                      className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete Purchase"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredPurchases.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">
                    No purchases found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Purchase Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="p-4 md:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add Purchase</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Supplier Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.supplierName}
                  onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter supplier name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Supplier Number
                </label>
                <input
                  type="tel"
                  value={formData.supplierNumber}
                  onChange={(e) => setFormData({ ...formData, supplierNumber: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter mobile number"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Items purchased, notes, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Bill Photo (Optional)
                </label>
                {formData.billImage ? (
                  <div className="relative mt-2">
                    <img src={formData.billImage} alt="Bill" className="w-full h-48 object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, billImage: null })}
                      className="absolute top-2 right-2 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-3">
                    <label className="flex-1 flex flex-col items-center justify-center h-24 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-bray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Camera className="w-6 h-6 mb-1 text-gray-500 dark:text-gray-400" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">Take Photo</p>
                      </div>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageCapture} />
                    </label>
                    <label className="flex-1 flex flex-col items-center justify-center h-24 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-bray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600 transition-colors">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <ImageIcon className="w-6 h-6 mb-1 text-gray-500 dark:text-gray-400" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">Upload Image</p>
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageCapture} />
                    </label>
                  </div>
                )}
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

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save Purchase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Bill Image Modal */}
      {viewImage && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4" onClick={() => setViewImage(null)}>
          <div className="relative max-w-4xl w-full h-full flex items-center justify-center">
            <button 
              onClick={() => setViewImage(null)}
              className="absolute top-4 right-4 p-2 bg-white/10 text-white rounded-full hover:bg-white/20 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img src={viewImage} alt="Bill Receipt" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!itemToDelete}
        onCancel={() => setItemToDelete(null)}
        onConfirm={handleDelete}
        title="Delete Purchase"
        message="Are you sure you want to delete this purchase? This action cannot be undone."
      />

      <CustomizeFieldsModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        feature="purchases"
      />
    </div>
  );
}
