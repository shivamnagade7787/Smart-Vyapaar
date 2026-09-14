import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Bell, X } from 'lucide-react';

export default function ReminderService() {
  const { user, uid, activeBusiness } = useAuth();
  const [reminders, setReminders] = useState<any[]>([]);
  const [activeReminders, setActiveReminders] = useState<any[]>([]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'products'), where('userId', '==', uid));
    const unsub = onSnapshot(q, (snapshot) => {
      const products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((d: any) => 
          (d.businessId || 'Business 1') === activeBusiness && 
          d.enableReminder && 
          d.reminderDate && 
          d.reminderTime &&
          !d.reminderDismissed
        );
      setReminders(products);
    });
    return () => unsub();
  }, [user, activeBusiness]);

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();

      const triggered = reminders.filter(r => {
        // Create a Date object for the reminder
        const reminderDateTime = new Date(`${r.reminderDate}T${r.reminderTime}`);
        // Trigger if the current time is past the reminder time
        return now >= reminderDateTime;
      });

      if (triggered.length > 0) {
        setActiveReminders(prev => {
          const newReminders = [...prev];
          let addedNew = false;
          triggered.forEach(t => {
            if (!newReminders.find(nr => nr.id === t.id)) {
              newReminders.push(t);
              addedNew = true;
              // Show browser notification if permitted
              if (Notification.permission === 'granted') {
                new Notification('Inventory Reminder', {
                  body: `Reminder for product: ${t.name}\nStock: ${t.stockQuantity}`,
                });
              }
            }
          });
          return addedNew ? newReminders : prev;
        });
      }
    };

    // Check immediately on mount or when reminders change
    checkReminders();
    
    // Check every 10 seconds instead of 60 to be more responsive
    const interval = setInterval(checkReminders, 10000);

    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => clearInterval(interval);
  }, [reminders]);

  const dismissReminder = async (id: string) => {
    // Remove from UI immediately for snappy response
    setActiveReminders(prev => prev.filter(r => r.id !== id));
    
    // Update Firestore so it doesn't trigger again
    try {
      await updateDoc(doc(db, 'products', id), {
        reminderDismissed: true
      });
    } catch (error) {
      console.error("Error dismissing reminder:", error);
    }
  };

  const sendWhatsApp = (reminder: any) => {
    if (!reminder.ownerWhatsApp) return;
    const message = encodeURIComponent(
      `*Inventory Reminder / इन्व्हेंटरी रिमाइंडर*\n\nProduct / उत्पादन: ${reminder.name}\nCurrent Stock / सध्याचा स्टॉक: ${reminder.stockQuantity}\nDate / तारीख: ${reminder.reminderDate} ${reminder.reminderTime}`
    );
    window.open(`https://wa.me/${reminder.ownerWhatsApp.replace(/[^0-9]/g, '')}?text=${message}`, '_blank');
    dismissReminder(reminder.id);
  };

  if (activeReminders.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[95%] max-w-md space-y-2 pointer-events-none">
      {activeReminders.map(reminder => (
        <div key={reminder.id} className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200/50 dark:border-gray-700/50 p-3 w-full animate-in slide-in-from-top-5 fade-in duration-300 pointer-events-auto">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 bg-blue-500 rounded-full p-2 mt-0.5">
              <Bell className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  Stock Reminder
                </p>
                <button onClick={() => dismissReminder(reminder.id)} className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 -mr-1 -mt-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                <span className="font-medium text-gray-900 dark:text-gray-100">{reminder.name}</span> is running low. Current stock: <span className="font-medium text-gray-900 dark:text-gray-100">{reminder.stockQuantity}</span>
              </p>
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={() => sendWhatsApp(reminder)}
                  className="flex-1 px-3 py-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-colors font-medium"
                >
                  Open WhatsApp
                </button>
                <button 
                  onClick={() => dismissReminder(reminder.id)}
                  className="flex-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
