import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useAuth, CustomField, CustomFields } from '../contexts/AuthContext';

interface CustomizeFieldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: keyof CustomFields;
}

export default function CustomizeFieldsModal({ isOpen, onClose, feature }: CustomizeFieldsModalProps) {
  const { customFields, updateCustomFields } = useAuth();
  const [fields, setFields] = useState<CustomField[]>([]);

  useEffect(() => {
    if (isOpen) {
      setFields(customFields[feature] || []);
    }
  }, [isOpen, customFields, feature]);

  const handleAddField = () => {
    setFields([...fields, { id: Date.now().toString(), name: '', type: 'text' }]);
  };

  const handleRemoveField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
  };

  const handleChange = (id: string, key: string, value: string) => {
    setFields(fields.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const handleSave = async () => {
    const validFields = fields.filter(f => f.name.trim() !== '');
    await updateCustomFields(feature, validFields);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Customize Fields</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {fields.map((field) => (
            <div key={field.id} className="flex gap-2 items-start">
              <div className="flex-1 space-y-2">
                <input 
                  type="text" 
                  placeholder="Field Name" 
                  value={field.name}
                  onChange={(e) => handleChange(field.id, 'name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <select 
                  value={field.type}
                  onChange={(e) => handleChange(field.id, 'type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                </select>
              </div>
              <button onClick={() => handleRemoveField(field.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg mt-1">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
          <button onClick={handleAddField} className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium hover:underline">
            <Plus className="w-4 h-4" /> Add Field
          </button>
        </div>
        <div className="p-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Save</button>
        </div>
      </div>
    </div>
  );
}
