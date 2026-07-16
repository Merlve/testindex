import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Loader2, User, Search, ChevronLeft, Plus, Trash2, Download, Upload, CheckSquare, Square, Eye, EyeOff, Calendar, Key } from 'lucide-react';

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { token } = useAuth();
  const [expirations, setExpirations] = useState<Record<string, string>>({});
  
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [bulkAction, setBulkAction] = useState<'password' | 'expiration' | null>(null);
  const [bulkValue, setBulkValue] = useState('');

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/admin/user/list', { headers: { Authorization: token } });
      if (res.data?.data?.content) {
        setUsers(res.data.data.content);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchExpirations = async () => {
    try {
      const res = await axios.get('/api/users/expirations', { headers: { Authorization: token } });
      setExpirations(res.data);
    } catch (e) {}
  };

  useEffect(() => {
    fetchUsers();
    fetchExpirations();
  }, [token]);

  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredUsers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredUsers.map(u => u.id)));
    }
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBatchDelete = async () => {
    if (!confirm('Are you sure you want to delete selected users?')) return;
    setLoading(true);
    for (const id of selectedIds) {
      try {
        await axios.post('/api/admin/user/delete', { id }, { headers: { Authorization: token } });
        // Also remove expiration
        await axios.post('/api/users/expirations', { userId: id, expirationDate: '' }, { headers: { Authorization: token } });
      } catch (e) { console.error('Failed to delete', id); }
    }
    setSelectedIds(new Set());
    await fetchUsers();
  };

  const handleBatchDisable = async () => {
    setLoading(true);
    for (const id of selectedIds) {
      try {
        const user = users.find(u => u.id === id);
        if (user) {
          await axios.post('/api/admin/user/update', { ...user, disabled: true }, { headers: { Authorization: token } });
        }
      } catch (e) { console.error('Failed to disable', id); }
    }
    setSelectedIds(new Set());
    await fetchUsers();
  };

  const handleBatchEnable = async () => {
    setLoading(true);
    for (const id of selectedIds) {
      try {
        const user = users.find(u => u.id === id);
        if (user) {
          await axios.post('/api/admin/user/update', { ...user, disabled: false }, { headers: { Authorization: token } });
        }
      } catch (e) { console.error('Failed to enable', id); }
    }
    setSelectedIds(new Set());
    await fetchUsers();
  };

  const executeBulkAction = async () => {
    setLoading(true);
    for (const id of selectedIds) {
      if (bulkAction === 'password') {
        try {
          const user = users.find(u => u.id === id);
          if (user) {
            await axios.post('/api/admin/user/update', { ...user, password: bulkValue }, { headers: { Authorization: token } });
          }
        } catch (e) { console.error('Failed to set password', id); }
      } else if (bulkAction === 'expiration') {
        try {
          await axios.post('/api/users/expirations', { userId: id, expirationDate: bulkValue }, { headers: { Authorization: token } });
        } catch (e) { console.error('Failed to set expiration', id); }
      }
    }
    setBulkAction(null);
    setBulkValue('');
    setSelectedIds(new Set());
    await fetchUsers();
    await fetchExpirations();
  };

  const handleExport = () => {
    const exportedUsers = users
      .filter(u => selectedIds.has(u.id))
      .map(u => ({ ...u, expirationDate: expirations[u.id] || '' }));
    
    if (exportedUsers.length === 0) return alert('No users selected');

    const blob = new Blob([JSON.stringify(exportedUsers, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users_export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const importedUsers = JSON.parse(event.target?.result as string);
        if (!Array.isArray(importedUsers)) throw new Error('Invalid format');

        setLoading(true);
        for (const u of importedUsers) {
          try {
            const { id, expirationDate, ...userData } = u;
            const res = await axios.post('/api/admin/user/create', { ...userData, disabled: false }, { headers: { Authorization: token } });
            
            if (expirationDate) {
               const listRes = await axios.get('/api/admin/user/list', { headers: { Authorization: token } });
               const newUsers = listRes.data?.data?.content || [];
               const createdUser = newUsers.find((nu: any) => nu.username === userData.username);
               if (createdUser) {
                 await axios.post('/api/users/expirations', { userId: createdUser.id, expirationDate }, { headers: { Authorization: token } });
               }
            }
          } catch (err) {
             console.error('Failed to create user', u.username);
          }
        }
        await fetchUsers();
        await fetchExpirations();
        alert('Import completed');
      } catch (err) {
        alert('Failed to parse file');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  if (selectedUser || isCreating) {
    return (
      <div className="p-4 md:p-8 lg:p-12 max-w-4xl mx-auto space-y-8">
        <button 
          onClick={() => { setSelectedUser(null); setIsCreating(false); }}
          className="flex items-center text-gray-500 hover:text-black dark:hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Users
        </button>
        <UserEditForm 
          user={selectedUser || { username: '', base_path: '/', role: 0, disabled: false, permission: 0 }} 
          isCreating={isCreating}
          onSaved={() => { 
            fetchUsers(); 
            fetchExpirations(); 
            setSelectedUser(null);
            setIsCreating(false);
          }} 
          token={token!} 
          expirations={expirations} 
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-3xl font-bold text-black dark:text-white">User Management</h2>
        
        {bulkAction && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-[#1a1a22] rounded-3xl border border-black/10 dark:border-white/10 p-8 w-full max-w-sm shadow-2xl">
              <h3 className="text-2xl font-bold text-black dark:text-white mb-6 tracking-tight">
                {bulkAction === 'password' ? 'Set Password' : 'Set Expiration'}
              </h3>
              <p className="text-gray-500 mb-6 text-sm">
                This will apply to all {selectedIds.size} selected users.
              </p>
              
              <input
                type={bulkAction === 'password' ? 'text' : 'date'}
                value={bulkValue}
                onChange={e => setBulkValue(e.target.value)}
                className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors mb-6"
                placeholder={bulkAction === 'password' ? "Enter new password" : ""}
              />
              
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => { setBulkAction(null); setBulkValue(''); }} 
                  className="px-5 py-3 rounded-xl font-medium text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={executeBulkAction} 
                  disabled={loading}
                  className="px-6 py-3 rounded-xl font-bold bg-purple-600 text-white shadow-lg hover:bg-purple-500 transition-all disabled:opacity-50"
                >
                  {loading ? 'Applying...' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
            />
          </div>
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center shadow-lg hover:bg-purple-500 transition-all shrink-0"
          >
            <Plus className="w-4 h-4 mr-1" /> Add User
          </button>
        </div>
      </div>

      <div className="bg-[#fffcf9]/80 dark:bg-[#1a1a22]/80 border border-black/5 dark:border-white/5 rounded-2xl p-4 flex flex-wrap items-center gap-4 shadow-sm">
        <button onClick={toggleSelectAll} className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white">
          {selectedIds.size === filteredUsers.length && filteredUsers.length > 0 ? <CheckSquare className="w-5 h-5 mr-2" /> : <Square className="w-5 h-5 mr-2" />}
          Select All
        </button>
        
        <div className="h-6 w-px bg-black/10 dark:bg-white/10 mx-2"></div>
        
        <button onClick={handleBatchDelete} disabled={selectedIds.size === 0} className="flex items-center text-sm font-medium text-red-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed">
          <Trash2 className="w-4 h-4 mr-1" /> Delete
        </button>
        
        <button onClick={handleBatchDisable} disabled={selectedIds.size === 0} className="flex items-center text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed">
          Disable
        </button>

        <button onClick={handleBatchEnable} disabled={selectedIds.size === 0} className="flex items-center text-sm font-medium text-green-600 dark:text-green-400 hover:text-green-500 disabled:opacity-50 disabled:cursor-not-allowed">
          Enable
        </button>

        <button onClick={() => { setBulkAction('password'); setBulkValue(''); }} disabled={selectedIds.size === 0} className="flex items-center text-sm font-medium text-purple-500 hover:text-purple-600 disabled:opacity-50 disabled:cursor-not-allowed">
          <Key className="w-4 h-4 mr-1" /> Set Password
        </button>

        <button onClick={() => { setBulkAction('expiration'); setBulkValue(''); }} disabled={selectedIds.size === 0} className="flex items-center text-sm font-medium text-orange-500 hover:text-orange-600 disabled:opacity-50 disabled:cursor-not-allowed">
          <Calendar className="w-4 h-4 mr-1" /> Set Expiration
        </button>

        <button onClick={handleExport} disabled={selectedIds.size === 0} className="flex items-center text-sm font-medium text-blue-500 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed">
          <Download className="w-4 h-4 mr-1" /> Export
        </button>

        <label className="flex items-center text-sm font-medium text-green-500 hover:text-green-600 cursor-pointer">
          <Upload className="w-4 h-4 mr-1" /> Import
          <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
        </label>
        
        <span className="text-sm text-gray-400 ml-auto">{selectedIds.size} selected</span>
      </div>
      
      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.length === 0 ? (
            <div className="col-span-full p-12 text-center text-gray-500">
              No users found matching "{searchQuery}"
            </div>
          ) : (
            filteredUsers.map(u => (
              <div
                key={u.id}
                onClick={() => setSelectedUser(u)}
                className={`w-full text-left p-6 rounded-2xl border flex items-center transition-all bg-[#fffcf9]/80 dark:bg-[#1a1a22]/80 hover:shadow-lg backdrop-blur-sm cursor-pointer ${selectedIds.has(u.id) ? 'border-purple-500 shadow-sm' : 'border-black/5 dark:border-white/5 hover:border-purple-500/30'}`}
              >
                <div onClick={(e) => toggleSelect(u.id, e)} className="mr-4 text-gray-400 hover:text-purple-500 transition-colors">
                  {selectedIds.has(u.id) ? <CheckSquare className="w-5 h-5 text-purple-500" /> : <Square className="w-5 h-5" />}
                </div>
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center mr-4 shrink-0">
                  <User className="w-5 h-5 text-purple-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-black dark:text-white font-bold truncate">{u.username}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`w-2 h-2 rounded-full ${u.disabled ? 'bg-red-500' : 'bg-green-500'}`}></span>
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">
                      {u.disabled ? 'Disabled' : 'Active'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function UserEditForm({ user, isCreating, onSaved, token, expirations }: { user: any, isCreating: boolean, onSaved: () => void, token: string, expirations: Record<string, string> }) {
  const [formData, setFormData] = useState({ ...user, password: '', expirationDate: expirations[user.id] || '' });
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setFormData({ ...user, password: '', expirationDate: expirations[user.id] || '' });
  }, [user, expirations]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let createdUserId = user.id;

      if (isCreating) {
        if (!formData.username || !formData.password) {
          alert('Username and password are required');
          setSaving(false);
          return;
        }
        await axios.post('/api/admin/user/create', {
          username: formData.username,
          password: formData.password,
          base_path: formData.base_path,
          role: formData.role,
          disabled: formData.disabled,
          permission: formData.permission
        }, { headers: { Authorization: token } });
        
        // Try to fetch to get ID to set expiration
        if (formData.expirationDate) {
          const listRes = await axios.get('/api/admin/user/list', { headers: { Authorization: token } });
          const newUsers = listRes.data?.data?.content || [];
          const createdUser = newUsers.find((nu: any) => nu.username === formData.username);
          if (createdUser) createdUserId = createdUser.id;
        }
      } else {
        await axios.post('/api/admin/user/update', {
          id: formData.id,
          username: formData.username,
          password: formData.password || undefined,
          base_path: formData.base_path,
          role: formData.role,
          disabled: formData.disabled,
          permission: formData.permission
        }, { headers: { Authorization: token } });
      }
      
      if (createdUserId) {
        await axios.post('/api/users/expirations', {
          userId: createdUserId,
          expirationDate: formData.expirationDate
        }, { headers: { Authorization: token } });
      }

      alert(`User ${isCreating ? 'created' : 'updated'} successfully!`);
      onSaved();
    } catch (e) {
      alert(`Failed to ${isCreating ? 'create' : 'update'} user`);
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (bit: number) => {
    const current = formData.permission || 0;
    const isSet = (current & bit) === bit;
    setFormData({ ...formData, permission: isSet ? current & ~bit : current | bit });
  };

  const permissionsList = [
    { bit: 1, label: 'See Hidden' },
    { bit: 2, label: 'Access Without Password' },
    { bit: 4, label: 'Add' },
    { bit: 8, label: 'Write' },
    { bit: 16, label: 'Rename' },
    { bit: 32, label: 'Move' },
    { bit: 64, label: 'Copy' },
    { bit: 128, label: 'Delete' },
    { bit: 256, label: 'WebDAV Read' },
    { bit: 512, label: 'WebDAV Manage' },
    { bit: 1024, label: 'Offline Download' }
  ];

  return (
    <div className="bg-[#fffcf9]/80 dark:bg-[#1a1a22]/80 rounded-3xl border border-black/10 dark:border-white/10 p-8 md:p-12 space-y-8 shadow-2xl backdrop-blur-sm">
      <div>
        <h3 className="text-3xl font-bold text-black dark:text-white tracking-tight">{isCreating ? 'Create User' : 'Edit User'}</h3>
        <p className="text-gray-500 mt-2 text-lg">{isCreating ? 'Fill in details for the new user' : `Update settings for ${user.username}`}</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Username</label>
          <input 
            className="w-full bg-white dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:border-purple-500 focus:outline-none transition-colors"
            value={formData.username}
            onChange={e => setFormData({...formData, username: e.target.value})}
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{isCreating ? 'Password' : 'Change Password'}</label>
          <div className="relative">
            <input 
              className="w-full bg-white dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 pr-12 text-black dark:text-white focus:border-purple-500 focus:outline-none transition-colors"
              type={showPassword ? "text" : "password"}
              placeholder={isCreating ? "Enter password" : "Leave blank to keep unchanged"}
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-500 transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Base Path</label>
          <input 
            className="w-full bg-white dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:border-purple-500 focus:outline-none transition-colors font-mono"
            value={formData.base_path}
            onChange={e => setFormData({...formData, base_path: e.target.value})}
            placeholder="/"
          />
        </div>
        
        <div className="bg-white/50 dark:bg-[#08080a]/50 p-6 rounded-2xl border border-black/5 dark:border-white/5">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Account Status</label>
          <label className="flex items-center space-x-3 cursor-pointer">
            <input 
              type="checkbox" 
              checked={formData.disabled}
              onChange={e => setFormData({...formData, disabled: e.target.checked})}
              className="w-5 h-5 accent-purple-600 rounded"
            />
            <span className="text-black dark:text-white font-medium">Disable Account</span>
          </label>
        </div>

        <div className="bg-white/50 dark:bg-[#08080a]/50 p-6 rounded-2xl border border-black/5 dark:border-white/5">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Expiration Date (8 AM)</label>
          <input 
            type="date"
            className="w-full bg-white dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:border-purple-500 focus:outline-none transition-colors"
            value={formData.expirationDate}
            onChange={e => setFormData({...formData, expirationDate: e.target.value})}
          />
          <p className="text-[10px] text-gray-500 mt-2">Leave empty for no expiration. Disables automatically on set date at 8:00 AM.</p>
        </div>
      </div>

      <div className="pt-8 border-t border-black/5 dark:border-white/5">
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-6">Permissions</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
          {permissionsList.map(p => {
            const isChecked = (formData.permission & p.bit) === p.bit;
            return (
              <label key={p.bit} className="flex items-center space-x-3 cursor-pointer group">
                <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isChecked ? 'bg-purple-600 border-purple-600' : 'bg-transparent border-gray-400 group-hover:border-purple-500'}`}>
                  {isChecked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-black dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{p.label}</span>
              </label>
            )
          })}
        </div>
      </div>

      <div className="pt-8 flex justify-end">
        <button 
          onClick={handleSave}
          disabled={saving}
          className="bg-purple-600 text-white font-bold px-10 py-4 rounded-xl hover:bg-purple-500 transition-all flex items-center shadow-xl shadow-purple-600/20 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-5 h-5 animate-spin mr-2" />}
          {isCreating ? 'Create User' : 'Save User Changes'}
        </button>
      </div>
    </div>
  );
}
