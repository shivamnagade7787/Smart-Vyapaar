import React, { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Home, ShoppingCart, Users, Package, FileText, Wallet, Store, ChevronDown, Settings, X, Upload, Trash2, Receipt, Plus, Sun, Moon, Settings2, BookOpen, Smartphone, Link2, Unlink, Menu } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth, CustomFields } from '../../contexts/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import CustomizeFieldsModal from '../CustomizeFieldsModal';
import ReminderService from '../ReminderService';

export default function Layout() {
  const { 
    user, uid, activeBusiness, setActiveBusiness, businesses, addBusiness, updateBusiness, deleteBusiness,
    upiId, setUpiId, 
    qrCodeImage, setQrCodeImage, 
    billTemplate, setBillTemplate,
    invoiceFont, setInvoiceFont,
    invoiceColor, setInvoiceColor,
    logoPlacement, setLogoPlacement,
    linkedPhone, myPhone, registerPhone, linkDevice, unlinkDevice
  } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddBusinessOpen, setIsAddBusinessOpen] = useState(false);
  const [isEditBusinessOpen, setIsEditBusinessOpen] = useState(false);
  const [newBizData, setNewBizData] = useState({ name: '', type: '', gst: '' });
  const [editBizData, setEditBizData] = useState({ id: '', name: '', type: '', gst: '' });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);
  const [tempUpi, setTempUpi] = useState(upiId);
  const [tempQr, setTempQr] = useState(qrCodeImage);
  const [tempTemplate, setTempTemplate] = useState(billTemplate || 'standard');
  const [tempFont, setTempFont] = useState(invoiceFont || 'helvetica');
  const [tempColor, setTempColor] = useState(invoiceColor || '#2563eb');
  const [tempPlacement, setTempPlacement] = useState(logoPlacement || 'left');
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState<number>(1);
  const [tempNextInvoiceNumber, setTempNextInvoiceNumber] = useState<number>(1);
  const [isCustomizeModalOpen, setIsCustomizeModalOpen] = useState(false);
  const [customizeFeature, setCustomizeFeature] = useState<keyof CustomFields>('sales');
  const [isDeviceLinkOpen, setIsDeviceLinkOpen] = useState(false);
  const [deviceLinkPhone, setDeviceLinkPhone] = useState('');
  const [myPhoneInput, setMyPhoneInput] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isSettingsOpen) {
      setTempUpi(upiId);
      setTempQr(qrCodeImage);
      setTempTemplate(billTemplate || 'standard');
      setTempFont(invoiceFont || 'helvetica');
      setTempColor(invoiceColor || '#2563eb');
      setTempPlacement(logoPlacement || 'left');
      setTempNextInvoiceNumber(nextInvoiceNumber);
    }
  }, [isSettingsOpen, upiId, qrCodeImage, billTemplate, invoiceFont, invoiceColor, logoPlacement, nextInvoiceNumber]);

  useEffect(() => {
    if (uid && activeBusiness) {
      const fetchSettings = async () => {
        const docRef = doc(db, 'businessSettings', `${uid}_${activeBusiness}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setNextInvoiceNumber(docSnap.data().nextInvoiceNumber || 1);
        } else {
          setNextInvoiceNumber(1);
        }
      };
      fetchSettings();
    }
  }, [user, activeBusiness, isSettingsOpen]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 400;
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
            setTempQr(canvas.toDataURL('image/jpeg', 0.8));
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveSettings = async () => {
    setUpiId(tempUpi);
    setQrCodeImage(tempQr);
    setBillTemplate(tempTemplate);
    setInvoiceFont(tempFont);
    setInvoiceColor(tempColor);
    setLogoPlacement(tempPlacement);
    
    if (uid && activeBusiness) {
      const docRef = doc(db, 'businessSettings', `${uid}_${activeBusiness}`);
      await setDoc(docRef, { nextInvoiceNumber: Number(tempNextInvoiceNumber) }, { merge: true });
      setNextInvoiceNumber(Number(tempNextInvoiceNumber));
    }
    
    setIsSettingsOpen(false);
  };

  const handleAddBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBizData.name.trim()) return;
    
    await addBusiness({
      name: newBizData.name.trim(),
      type: newBizData.type.trim(),
      gst: newBizData.gst.trim()
    });
    
    setActiveBusiness(newBizData.name.trim());
    setIsAddBusinessOpen(false);
    setNewBizData({ name: '', type: '', gst: '' });
  };

  const handleEditBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBizData.name.trim() || !editBizData.id) return;
    
    await updateBusiness(editBizData.id, {
      name: editBizData.name.trim(),
      type: editBizData.type.trim(),
      gst: editBizData.gst.trim()
    });
    
    setIsEditBusinessOpen(false);
  };

  const handleDeleteBusiness = async () => {
    const currentBiz = businesses.find(b => b.name === activeBusiness);
    if (!currentBiz) return;
    
    if (window.confirm(`Are you sure you want to delete ${currentBiz.name}? This action cannot be undone.`)) {
      await deleteBusiness(currentBiz.id);
    }
  };

  const openEditBusiness = () => {
    const currentBiz = businesses.find(b => b.name === activeBusiness);
    if (currentBiz) {
      setEditBizData({
        id: currentBiz.id,
        name: currentBiz.name,
        type: currentBiz.type || '',
        gst: currentBiz.gst || ''
      });
      setIsEditBusinessOpen(true);
    }
  };

  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: ShoppingCart, label: 'Sales', path: '/sales' },
    { icon: Receipt, label: 'Purchases', path: '/purchases' },
    { icon: Wallet, label: 'Expenses', path: '/expenses' },
    { icon: Package, label: 'Items', path: '/inventory' },
    { icon: Users, label: 'Parties', path: '/parties' },
    { icon: BookOpen, label: 'Udhar (Credit)', path: '/credit' },
    { icon: FileText, label: 'Reports', path: '/reports' },
  ];

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full overflow-hidden shrink-0 transition-all duration-300",
        isMobileMenuOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full md:translate-x-0 md:w-16 md:hover:w-64 group"
      )}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 relative flex items-center justify-between md:justify-start">
          <div className="flex items-center gap-3 w-full relative">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center shrink-0 mx-auto md:mx-0">
              <Store className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className={cn(
              "overflow-hidden whitespace-nowrap transition-opacity flex-1 flex items-center justify-between",
              isMobileMenuOpen ? "opacity-100 w-auto" : "opacity-0 md:group-hover:opacity-100 w-0 md:group-hover:w-auto"
            )}>
              <div>
                <h1 className="text-sm font-bold text-gray-900 dark:text-white truncate max-w-[120px]">{activeBusiness}</h1>
                <p className="text-[10px] text-gray-500">Switch Business</p>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
            </div>
            {/* Native Select for Business Switching */}
            <select
              value={activeBusiness}
              onChange={(e) => {
                if (e.target.value === 'ADD_NEW') {
                  setIsAddBusinessOpen(true);
                } else {
                  setActiveBusiness(e.target.value);
                }
                setIsMobileMenuOpen(false);
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              title="Switch Business"
            >
              {businesses.map((biz) => (
                <option key={biz.id} value={biz.name}>{biz.name}</option>
              ))}
              <option value="ADD_NEW">+ Add New Business</option>
            </select>
          </div>
          {isMobileMenuOpen && (
            <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsMobileMenuOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 p-3 rounded-lg transition-colors whitespace-nowrap overflow-hidden',
                  isActive 
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 font-medium' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                )
              }
            >
              <div className="flex items-center justify-center w-6 h-6 shrink-0 mx-auto md:mx-0">
                <item.icon className="w-5 h-5" />
              </div>
              <span className={cn(
                "transition-opacity text-sm",
                isMobileMenuOpen ? "opacity-100" : "opacity-0 md:group-hover:opacity-100"
              )}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => {
              setTempUpi(upiId);
              setIsSettingsOpen(true);
              setIsMobileMenuOpen(false);
            }}
            className="flex items-center gap-3 p-3 w-full text-left text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg transition-colors whitespace-nowrap overflow-hidden"
          >
            <div className="flex items-center justify-center w-6 h-6 shrink-0 mx-auto md:mx-0">
              <Settings className="w-5 h-5" />
            </div>
            <span className={cn(
              "transition-opacity text-sm",
              isMobileMenuOpen ? "opacity-100" : "opacity-0 md:group-hover:opacity-100"
            )}>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-gray-50 dark:bg-gray-900 relative">
        {/* Header */}
        <header className="h-16 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-blue-600 dark:text-blue-400 truncate max-w-[200px] sm:max-w-none">Welcome {activeBusiness}</h1>
          </div>
          <div className="relative group/profile">
            <button className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
              {activeBusiness.charAt(0).toUpperCase()}
            </button>
            <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 opacity-0 invisible group-hover/profile:opacity-100 group-hover/profile:visible transition-all z-50">
              <div className="p-2">
                <button 
                  onClick={openEditBusiness} 
                  className="w-full text-left px-4 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                >
                  <Store className="w-4 h-4" />
                  Business Details
                </button>
                <button 
                  onClick={openEditBusiness} 
                  className="w-full text-left px-4 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                >
                  <Settings2 className="w-4 h-4" />
                  Edit Business
                </button>
                <button 
                  onClick={handleDeleteBusiness} 
                  className="w-full text-left px-4 py-2 rounded-lg text-sm hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2 text-red-600 dark:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Business
                </button>
                <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                <button 
                  onClick={() => setIsDeviceLinkOpen(true)}
                  className="w-full text-left px-4 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                >
                  <Smartphone className="w-4 h-4" />
                  Link Device
                </button>
                <div className="h-px bg-gray-100 dark:bg-gray-700 my-1"></div>
                <button 
                  onClick={() => setIsDarkMode(!isDarkMode)} 
                  className="w-full text-left px-4 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                >
                  {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-6">
          <Outlet />
        </div>
      </main>

      {/* Add Business Modal */}
      {isAddBusinessOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="p-4 md:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add New Business</h2>
              <button onClick={() => setIsAddBusinessOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleAddBusiness} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={newBizData.name}
                  onChange={(e) => setNewBizData({ ...newBizData, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter business name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Business Type (Optional)
                </label>
                <input
                  type="text"
                  value={newBizData.type}
                  onChange={(e) => setNewBizData({ ...newBizData, type: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Retail, Wholesale, Services"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  GST Number (Optional)
                </label>
                <input
                  type="text"
                  value={newBizData.gst}
                  onChange={(e) => setNewBizData({ ...newBizData, gst: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter GSTIN"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddBusinessOpen(false)}
                  className="flex-1 px-4 py-2 text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add Business
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Business Modal */}
      {isEditBusinessOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="p-4 md:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Edit Business Details</h2>
              <button onClick={() => setIsEditBusinessOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleEditBusiness} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={editBizData.name}
                  onChange={(e) => setEditBizData({ ...editBizData, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter business name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Business Type (Optional)
                </label>
                <input
                  type="text"
                  value={editBizData.type}
                  onChange={(e) => setEditBizData({ ...editBizData, type: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="e.g. Retail, Wholesale, Services"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  GST Number (Optional)
                </label>
                <input
                  type="text"
                  value={editBizData.gst}
                  onChange={(e) => setEditBizData({ ...editBizData, gst: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Enter GSTIN"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditBusinessOpen(false)}
                  className="flex-1 px-4 py-2 text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[90] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="p-4 md:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Settings</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 md:p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Starting Invoice Number
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 dark:text-gray-400 font-mono">INV-</span>
                  <input
                    type="number"
                    min="1"
                    value={tempNextInvoiceNumber}
                    onChange={(e) => setTempNextInvoiceNumber(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">The next invoice created will use this number.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Bill Template
                </label>
                <select
                  value={tempTemplate}
                  onChange={(e) => setTempTemplate(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="standard">Standard (A4 Classic)</option>
                  <option value="modern">Modern (A4 Colored Header)</option>
                  <option value="minimalist">Minimalist (A4 Clean)</option>
                  <option value="professional">Professional (A4 Bordered)</option>
                  <option value="bold">Bold (A4 Dark Header)</option>
                  <option value="elegant">Elegant (A4 Centered)</option>
                  <option value="corporate">Corporate (A4 Detailed)</option>
                  <option value="compact">Compact (A5 Size)</option>
                  <option value="thermal80">Thermal Receipt (80mm)</option>
                  <option value="thermal58">Thermal Receipt (58mm)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Invoice Font
                  </label>
                  <select
                    value={tempFont}
                    onChange={(e) => setTempFont(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="helvetica">Helvetica (Modern)</option>
                    <option value="times">Times New Roman (Classic)</option>
                    <option value="courier">Courier (Monospace)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Logo Placement
                  </label>
                  <select
                    value={tempPlacement}
                    onChange={(e) => setTempPlacement(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="left">Left Aligned</option>
                    <option value="center">Center Aligned</option>
                    <option value="right">Right Aligned</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Theme Color (For Modern/Bold templates)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={tempColor}
                    onChange={(e) => setTempColor(e.target.value)}
                    className="h-10 w-20 rounded cursor-pointer border border-gray-200 dark:border-gray-700"
                  />
                  <span className="text-sm text-gray-500 font-mono">{tempColor.toUpperCase()}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  UPI ID (For generating QR)
                </label>
                <input
                  type="text"
                  value={tempUpi}
                  onChange={(e) => setTempUpi(e.target.value)}
                  placeholder="e.g. yourname@upi"
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Or Upload Custom QR Code Image
                </label>
                {tempQr ? (
                  <div className="relative inline-block mt-2">
                    <img src={tempQr} alt="Custom QR" className="w-32 h-32 object-contain border border-gray-200 dark:border-gray-700 rounded-lg" />
                    <button
                      onClick={() => setTempQr(null)}
                      className="absolute -top-2 -right-2 p-1 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center justify-center w-full">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-bray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <Upload className="w-8 h-8 mb-2 text-gray-500 dark:text-gray-400" />
                        <p className="text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">Click to upload</span></p>
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                    </label>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-2">If uploaded, this image will be used instead of generating one from the UPI ID.</p>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Custom Fields Configuration
                </label>
                <div className="space-y-2">
                  {(['sales', 'purchases', 'inventory', 'parties', 'expenses'] as const).map(feature => (
                    <button
                      key={feature}
                      onClick={() => {
                        setCustomizeFeature(feature);
                        setIsCustomizeModalOpen(true);
                      }}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200 dark:border-gray-600"
                    >
                      <span className="capitalize text-sm font-medium text-gray-700 dark:text-gray-300">{feature} Fields</span>
                      <Settings2 className="w-4 h-4 text-gray-500" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 md:p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomizeFieldsModal
        isOpen={isCustomizeModalOpen}
        onClose={() => setIsCustomizeModalOpen(false)}
        feature={customizeFeature}
      />

      {/* Device Linking Modal */}
      {isDeviceLinkOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Link Device</h2>
              <button onClick={() => setIsDeviceLinkOpen(false)} className="text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {linkedPhone ? (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Currently Linked To</p>
                      <p className="font-medium text-gray-900 dark:text-white">{linkedPhone}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      unlinkDevice();
                      setIsDeviceLinkOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                  >
                    <Unlink className="w-5 h-5" />
                    Unlink Device
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Register Phone Section */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-900 dark:text-white">1. Register This Device</h3>
                    {myPhone ? (
                      <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-sm flex items-center gap-2">
                        <Smartphone className="w-4 h-4" />
                        Registered as: {myPhone}
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Register your phone number so other devices can link to this account.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="tel"
                            value={myPhoneInput}
                            onChange={(e) => setMyPhoneInput(e.target.value)}
                            placeholder="Your Phone Number"
                            className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                          />
                          <button
                            onClick={async () => {
                              if (myPhoneInput.trim()) {
                                try {
                                  await registerPhone(myPhoneInput);
                                } catch (error) {
                                  alert("Failed to register phone number.");
                                }
                              }
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                          >
                            Register
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="border-t border-gray-100 dark:border-gray-700"></div>

                  {/* Link Device Section */}
                  <div className="space-y-4">
                    <h3 className="font-medium text-gray-900 dark:text-white">2. Link to Another Device</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Enter the phone number of the device you want to link to.
                    </p>
                    <div>
                      <input
                        type="tel"
                        value={deviceLinkPhone}
                        onChange={(e) => setDeviceLinkPhone(e.target.value)}
                        placeholder="Target Phone Number"
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                      />
                    </div>
                    <button
                      onClick={async () => {
                        if (deviceLinkPhone.trim()) {
                          try {
                            await linkDevice(deviceLinkPhone);
                            setIsDeviceLinkOpen(false);
                            setDeviceLinkPhone('');
                          } catch (error) {
                            alert("Phone number not found. Make sure it is registered on the other device.");
                          }
                        }
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Link2 className="w-5 h-5" />
                      Link Device
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ReminderService />
    </div>
  );
}
