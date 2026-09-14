import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged, User, signOut, signInAnonymously } from 'firebase/auth';
import { db, auth } from '../lib/firebase';

export interface Business {
  id: string;
  name: string;
  type?: string;
  gst?: string;
}

export interface CustomField {
  id: string;
  name: string;
  type: 'text' | 'number';
}

export interface CustomFields {
  sales: CustomField[];
  purchases: CustomField[];
  inventory: CustomField[];
  parties: CustomField[];
  expenses: CustomField[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  activeBusiness: string;
  setActiveBusiness: (biz: string) => void;
  businesses: Business[];
  addBusiness: (biz: Omit<Business, 'id'>) => Promise<void>;
  updateBusiness: (id: string, biz: Partial<Business>) => Promise<void>;
  deleteBusiness: (id: string) => Promise<void>;
  upiId: string;
  setUpiId: (id: string) => void;
  qrCodeImage: string | null;
  setQrCodeImage: (img: string | null) => void;
  billTemplate: string;
  setBillTemplate: (template: string) => void;
  invoiceFont: string;
  setInvoiceFont: (font: string) => void;
  invoiceColor: string;
  setInvoiceColor: (color: string) => void;
  logoPlacement: string;
  setLogoPlacement: (placement: string) => void;
  customFields: CustomFields;
  updateCustomFields: (feature: keyof CustomFields, fields: CustomField[]) => Promise<void>;
  logout: () => Promise<void>;
  uid: string;
  linkedPhone: string | null;
  myPhone: string | null;
  registerPhone: (phone: string) => Promise<void>;
  linkDevice: (phone: string) => Promise<void>;
  unlinkDevice: () => void;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true,
  activeBusiness: 'Business 1',
  setActiveBusiness: () => {},
  businesses: [],
  addBusiness: async () => {},
  updateBusiness: async () => {},
  deleteBusiness: async () => {},
  upiId: '',
  setUpiId: () => {},
  qrCodeImage: null,
  setQrCodeImage: () => {},
  billTemplate: 'standard',
  setBillTemplate: () => {},
  invoiceFont: 'helvetica',
  setInvoiceFont: () => {},
  invoiceColor: '#2563eb',
  setInvoiceColor: () => {},
  logoPlacement: 'left',
  setLogoPlacement: () => {},
  customFields: { sales: [], purchases: [], inventory: [], parties: [], expenses: [] },
  updateCustomFields: async () => {},
  logout: async () => {},
  uid: '',
  myPhone: null,
  registerPhone: async () => {},
  linkDevice: () => {},
  unlinkDevice: () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBusiness, setActiveBusinessState] = useState('Business 1');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [upiId, setUpiIdState] = useState('');
  const [qrCodeImage, setQrCodeImageState] = useState<string | null>(null);
  const [billTemplate, setBillTemplateState] = useState('standard');
  const [invoiceFont, setInvoiceFontState] = useState('helvetica');
  const [invoiceColor, setInvoiceColorState] = useState('#2563eb');
  const [logoPlacement, setLogoPlacementState] = useState('left');
  const [customFields, setCustomFields] = useState<CustomFields>({
    sales: [], purchases: [], inventory: [], parties: [], expenses: []
  });
  const [linkedUid, setLinkedUid] = useState<string | null>(localStorage.getItem('smartvyapaar_linked_uid'));
  const [linkedPhone, setLinkedPhone] = useState<string | null>(localStorage.getItem('smartvyapaar_linked_phone'));
  const [myPhone, setMyPhone] = useState<string | null>(localStorage.getItem('smartvyapaar_my_phone'));

  const uid = linkedUid || (user ? user.uid : '');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setLoading(false);
      } else {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Anonymous auth failed:", error);
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) return;

    const savedBiz = localStorage.getItem('smartvyapaar_business');
    if (savedBiz) setActiveBusinessState(savedBiz);

    // Fetch businesses from Firestore
    const q = query(collection(db, 'businesses'), where('userId', '==', uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bizData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Business));
      if (bizData.length === 0) {
        // Add default business if none exists
        const defaultBiz = { name: 'Business 1', userId: uid };
        addDoc(collection(db, 'businesses'), defaultBiz);
      } else {
        setBusinesses(bizData);
        // If active business is not in the list, set to the first one
        if (savedBiz && !bizData.find(b => b.name === savedBiz)) {
          setActiveBusinessState(bizData[0].name);
          localStorage.setItem('smartvyapaar_business', bizData[0].name);
        } else if (!savedBiz) {
          setActiveBusinessState(bizData[0].name);
          localStorage.setItem('smartvyapaar_business', bizData[0].name);
        }
      }
    });

    const savedUpi = localStorage.getItem('smartvyapaar_upi');
    if (savedUpi) setUpiIdState(savedUpi);
    
    const savedQr = localStorage.getItem('smartvyapaar_qr');
    if (savedQr) setQrCodeImageState(savedQr);
    
    const savedTemplate = localStorage.getItem('smartvyapaar_template');
    if (savedTemplate) setBillTemplateState(savedTemplate);

    const savedFont = localStorage.getItem('smartvyapaar_font');
    if (savedFont) setInvoiceFontState(savedFont);

    const savedColor = localStorage.getItem('smartvyapaar_color');
    if (savedColor) setInvoiceColorState(savedColor);

    const savedPlacement = localStorage.getItem('smartvyapaar_placement');
    if (savedPlacement) setLogoPlacementState(savedPlacement);

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (uid && activeBusiness) {
      const docRef = doc(db, 'businessSettings', `${uid}_${activeBusiness}`);
      const unsub = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.customFields) {
            setCustomFields(data.customFields);
          } else {
            setCustomFields({ sales: [], purchases: [], inventory: [], parties: [], expenses: [] });
          }
        } else {
          setCustomFields({ sales: [], purchases: [], inventory: [], parties: [], expenses: [] });
        }
      });
      return () => unsub();
    }
  }, [uid, activeBusiness]);

  const setActiveBusiness = (biz: string) => {
    setActiveBusinessState(biz);
    localStorage.setItem('smartvyapaar_business', biz);
  };

  const setUpiId = (id: string) => {
    setUpiIdState(id);
    localStorage.setItem('smartvyapaar_upi', id);
  };

  const setQrCodeImage = (img: string | null) => {
    setQrCodeImageState(img);
    if (img) {
      localStorage.setItem('smartvyapaar_qr', img);
    } else {
      localStorage.removeItem('smartvyapaar_qr');
    }
  };

  const setBillTemplate = (template: string) => {
    setBillTemplateState(template);
    localStorage.setItem('smartvyapaar_template', template);
  };

  const setInvoiceFont = (font: string) => {
    setInvoiceFontState(font);
    localStorage.setItem('smartvyapaar_font', font);
  };

  const setInvoiceColor = (color: string) => {
    setInvoiceColorState(color);
    localStorage.setItem('smartvyapaar_color', color);
  };

  const setLogoPlacement = (placement: string) => {
    setLogoPlacementState(placement);
    localStorage.setItem('smartvyapaar_placement', placement);
  };

  const addBusiness = async (biz: Omit<Business, 'id'>) => {
    if (!uid) return;
    try {
      await addDoc(collection(db, 'businesses'), {
        ...biz,
        userId: uid
      });
    } catch (error) {
      console.error("Error adding business: ", error);
    }
  };

  const updateBusiness = async (id: string, biz: Partial<Business>) => {
    if (!uid) return;
    try {
      const docRef = doc(db, 'businesses', id);
      await updateDoc(docRef, biz);
      if (biz.name && biz.name !== activeBusiness) {
        setActiveBusiness(biz.name);
      }
    } catch (error) {
      console.error("Error updating business: ", error);
    }
  };

  const deleteBusiness = async (id: string) => {
    if (!uid) return;
    try {
      await deleteDoc(doc(db, 'businesses', id));
      if (businesses.length > 1) {
        const remaining = businesses.filter(b => b.id !== id);
        setActiveBusiness(remaining[0].name);
      }
    } catch (error) {
      console.error("Error deleting business: ", error);
    }
  };

  const updateCustomFields = async (feature: keyof CustomFields, fields: CustomField[]) => {
    if (!uid) return;
    const docRef = doc(db, 'businessSettings', `${uid}_${activeBusiness}`);
    await setDoc(docRef, {
      customFields: {
        ...customFields,
        [feature]: fields
      }
    }, { merge: true });
  };

  const registerPhone = async (phone: string) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'phone_links', phone), {
        uid: user.uid,
        createdAt: new Date().toISOString()
      });
      setMyPhone(phone);
      localStorage.setItem('smartvyapaar_my_phone', phone);
    } catch (error) {
      console.error("Error registering phone:", error);
      throw error;
    }
  };

  const linkDevice = async (phone: string) => {
    try {
      const docSnap = await getDocs(query(collection(db, 'phone_links'), where('__name__', '==', phone)));
      if (!docSnap.empty) {
        const targetUid = docSnap.docs[0].data().uid;
        setLinkedUid(targetUid);
        setLinkedPhone(phone);
        localStorage.setItem('smartvyapaar_linked_uid', targetUid);
        localStorage.setItem('smartvyapaar_linked_phone', phone);
      } else {
        throw new Error("Phone number not found");
      }
    } catch (error) {
      console.error("Error linking device:", error);
      throw error;
    }
  };

  const unlinkDevice = () => {
    setLinkedUid(null);
    setLinkedPhone(null);
    localStorage.removeItem('smartvyapaar_linked_uid');
    localStorage.removeItem('smartvyapaar_linked_phone');
  };

  const logout = async () => {
    try {
      await signOut(auth);
      unlinkDevice();
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      activeBusiness, 
      setActiveBusiness,
      businesses,
      addBusiness,
      updateBusiness,
      deleteBusiness,
      upiId, 
      setUpiId,
      qrCodeImage,
      setQrCodeImage,
      billTemplate,
      setBillTemplate,
      invoiceFont,
      setInvoiceFont,
      invoiceColor,
      setInvoiceColor,
      logoPlacement,
      setLogoPlacement,
      customFields,
      updateCustomFields,
      logout,
      uid,
      linkedPhone,
      myPhone,
      registerPhone,
      linkDevice,
      unlinkDevice
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
