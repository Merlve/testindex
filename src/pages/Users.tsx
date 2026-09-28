import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, User, Search, ChevronLeft, Plus, Trash2, Download, Upload, CheckSquare, Square, Eye, EyeOff, Calendar, Key, RefreshCw, Lock, Unlock, RotateCcw, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function Users() {
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'locked'>('all');
  const { token } = useAuth();
  
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [bulkAction, setBulkAction] = useState<'password' | 'expiration' | null>(null);
  const [bulkValue, setBulkValue] = useState('');

  const { data: usersData, isLoading: usersLoading, refetch: refetchUsers, isRefetching: isRefetchingUsers } = useQuery({
    queryKey: ['adminUsers', token],
    queryFn: async () => {
      const res = await axios.get(`/api/admin/user/list?refresh=true&t=${Date.now()}`, { headers: { Authorization: token } });
      return res.data?.data?.content || [];
    },
    enabled: !!token,
    staleTime: 0
  });

  const { data: expirationsData, isLoading: expirationsLoading, refetch: refetchExpirations, isRefetching: isRefetchingExpirations } = useQuery({
    queryKey: ['adminUserExpirations', token],
    queryFn: async () => {
      const res = await axios.get(`/api/users/expirations?t=${Date.now()}`, { headers: { Authorization: token } });
      return res.data || {};
    },
    enabled: !!token,
    staleTime: 0
  });

  const { data: lockoutsData, isLoading: lockoutsLoading, refetch: refetchLockouts, isRefetching: isRefetchingLockouts } = useQuery({
    queryKey: ['adminUserLockouts', token],
    queryFn: async () => {
      const res = await axios.get(`/api/users/lockouts?t=${Date.now()}`, { headers: { Authorization: token } });
      return res.data || {};
    },
    enabled: !!token,
    staleTime: 0
  });

  const users = usersData || [];
  const expirations = expirationsData || {};
  const lockouts = lockoutsData || {};
  const loading = usersLoading || expirationsLoading || lockoutsLoading || isRefetchingUsers || isRefetchingExpirations || isRefetchingLockouts || actionLoading;

  const fetchUsers = async () => { await refetchUsers(); };
  const fetchExpirations = async () => { await refetchExpirations(); };
  const fetchLockouts = async () => { await refetchLockouts(); };

  const filteredUsers = users.filter((u: any) => {
    const matchesSearch = u.username.toLowerCase().includes(searchQuery.toLowerCase());
    const isUserAdmin = u.role === 2 || u.username?.toLowerCase() === 'admin';
    const uLockout = lockouts[u.username?.toLowerCase()] || lockouts[String(u.id)];
    const isLocked = !isUserAdmin && !!uLockout?.locked;
    const matchesStatus = statusFilter === 'all' 
      ? true 
      : statusFilter === 'active' 
        ? !u.disabled 
        : statusFilter === 'disabled' 
          ? !!u.disabled 
          : isLocked;
    return matchesSearch && matchesStatus;
  });

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
    setActionLoading(true);
    try {
      let successCount = 0;
      for (const id of selectedIds) {
        try {
          const res = await axios.post('/api/admin/user/delete', { id }, { headers: { Authorization: token } });
          if (res.data?.code === 200) {
            successCount++;
            await axios.post('/api/users/expirations', { userId: id, expirationDate: '' }, { headers: { Authorization: token } });
          }
        } catch (e) { console.error('Failed to delete', id); }
      }
      await axios.post('/api/admin/log', { action: 'Batch Delete', details: `Deleted ${successCount} users.` }, { headers: { Authorization: token } });
      setSelectedIds(new Set());
      await fetchUsers();
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchDisable = async () => {
    setActionLoading(true);
    try {
      let successCount = 0;
      for (const id of selectedIds) {
        try {
          const user = users.find(u => u.id === id);
          if (user) {
            const res = await axios.post('/api/admin/user/update', { ...user, disabled: true }, { headers: { Authorization: token } });
            if (res.data?.code === 200) successCount++;
          }
        } catch (e) { console.error('Failed to disable', id); }
      }
      await axios.post('/api/admin/log', { action: 'Batch Disable', details: `Disabled ${successCount} users.` }, { headers: { Authorization: token } });
      setSelectedIds(new Set());
      await fetchUsers();
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchEnable = async () => {
    setActionLoading(true);
    try {
      let successCount = 0;
      for (const id of selectedIds) {
        try {
          const user = users.find(u => u.id === id);
          if (user) {
            const res = await axios.post('/api/admin/user/update', { ...user, disabled: false }, { headers: { Authorization: token } });
            if (res.data?.code === 200) successCount++;
          }
        } catch (e) { console.error('Failed to enable', id); }
      }
      await axios.post('/api/admin/log', { action: 'Batch Enable', details: `Enabled ${successCount} users.` }, { headers: { Authorization: token } });
      setSelectedIds(new Set());
      await fetchUsers();
    } finally {
      setActionLoading(false);
    }
  };

  const executeBulkAction = async () => {
    setActionLoading(true);
    try {
      let successCount = 0;
      for (const id of selectedIds) {
        if (bulkAction === 'password') {
          try {
            const user = users.find(u => u.id === id);
            if (user) {
              const res = await axios.post('/api/admin/user/update', { ...user, password: bulkValue }, { headers: { Authorization: token } });
              if (res.data?.code === 200) successCount++;
            }
          } catch (e) { console.error('Failed to set password', id); }
        } else if (bulkAction === 'expiration') {
          try {
            const isoDate = bulkValue ? new Date(bulkValue).toISOString() : '';
            const res = await axios.post('/api/users/expirations', { userId: id, expirationDate: isoDate }, { headers: { Authorization: token } });
            if (res.data?.success) successCount++;
          } catch (e) { console.error('Failed to set expiration', id); }
        }
      }
      await axios.post('/api/admin/log', { action: `Batch ${bulkAction === 'password' ? 'Password' : 'Expiration'} Update`, details: `Updated ${bulkAction} for ${successCount} users.` }, { headers: { Authorization: token } });
      setBulkAction(null);
      setBulkValue('');
      setSelectedIds(new Set());
      await fetchUsers();
      await fetchExpirations();
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchResetLockout = async () => {
    if (!confirm('Are you sure you want to reset login lockout for selected users?')) return;
    setActionLoading(true);
    try {
      const selectedUsers = users.filter(u => selectedIds.has(u.id));
      const usernames = selectedUsers.map(u => u.username);
      await axios.post('/api/users/batch-reset-lockout', {
        userIds: Array.from(selectedIds),
        usernames,
        reEnable: true
      }, { headers: { Authorization: token } });
      await fetchLockouts();
      await fetchUsers();
      setSelectedIds(new Set());
      alert('Login lockout has been reset for selected users.');
    } catch (e: any) {
      alert('Failed to reset lockout: ' + (e.response?.data?.message || e.message));
    } finally {
      setActionLoading(false);
    }
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

        setActionLoading(true);
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
        setActionLoading(false);
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
            fetchLockouts();
            setSelectedUser(null);
            setIsCreating(false);
          }} 
          onCancel={() => {
            setSelectedUser(null);
            setIsCreating(false);
          }}
          token={token!} 
          expirations={expirations}
          lockout={selectedUser ? (lockouts[selectedUser.username?.toLowerCase()] || lockouts[String(selectedUser.id)]) : undefined}
          onLockoutReset={async () => {
            await fetchLockouts();
            await fetchUsers();
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold text-black dark:text-white">User Management</h2>
            <p className="text-sm text-gray-500 mt-1">{users.filter(u => !u.disabled).length} active users</p>
          </div>
          
          <button 
            onClick={async () => {
              setActionLoading(true);
              try {
                await fetchUsers();
                await fetchExpirations();
                await fetchLockouts();
              } finally {
                setActionLoading(false);
              }
            }}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center shadow-lg hover:bg-blue-500 transition-all shrink-0 disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>
        
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
                type={bulkAction === 'password' ? 'text' : 'datetime-local'}
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

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'disabled' | 'locked')}
            className="bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-sm text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
          >
            <option value="all">All Users</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="locked">Locked Out</option>
          </select>
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

        <button onClick={handleBatchResetLockout} disabled={selectedIds.size === 0} className="flex items-center text-sm font-medium text-amber-500 hover:text-amber-600 disabled:opacity-50 disabled:cursor-not-allowed" title="Reset login lockout for selected users">
          <RotateCcw className="w-4 h-4 mr-1" /> Reset Lockout
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {filteredUsers.length === 0 ? (
            <div className="col-span-full p-8 text-center text-gray-500">
              No users found matching "{searchQuery}"
            </div>
          ) : (
            filteredUsers.map(u => {
              const isUserAdmin = u.role === 2 || u.username?.toLowerCase() === 'admin';
              const uLockout = lockouts[u.username?.toLowerCase()] || lockouts[String(u.id)];
              const isLocked = !isUserAdmin && !!uLockout?.locked;
              return (
                <div
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className={`w-full text-left p-2.5 sm:p-3.5 rounded-xl border flex items-center transition-all bg-[#fffcf9]/80 dark:bg-[#1a1a22]/80 hover:shadow-md backdrop-blur-sm cursor-pointer ${selectedIds.has(u.id) ? 'border-purple-500 shadow-sm' : isLocked ? 'border-red-500/40 bg-red-500/5' : 'border-black/5 dark:border-white/5 hover:border-purple-500/30'}`}
                >
                  <div onClick={(e) => toggleSelect(u.id, e)} className="mr-2.5 text-gray-400 hover:text-purple-500 transition-colors">
                    {selectedIds.has(u.id) ? <CheckSquare className="w-4 h-4 text-purple-500" /> : <Square className="w-4 h-4" />}
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 shrink-0 ${isUserAdmin ? 'bg-blue-500/10 text-blue-500' : isLocked ? 'bg-red-500/10 text-red-500' : 'bg-purple-500/10 text-purple-500'}`}>
                    {isUserAdmin ? <ShieldCheck className="w-4 h-4" /> : isLocked ? <Lock className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-black dark:text-white font-bold text-sm truncate">{u.username}</span>
                      {isUserAdmin && (
                        <span className="bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">
                          Admin
                        </span>
                      )}
                      {isLocked && (
                        <span className="bg-red-500/15 border border-red-500/30 text-red-600 dark:text-red-400 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 flex items-center gap-0.5">
                          <Lock className="w-2.5 h-2.5" /> Locked
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isLocked ? 'bg-red-500' : u.disabled ? 'bg-amber-500' : 'bg-green-500'}`}></span>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                        {isLocked ? 'Locked Out' : u.disabled ? 'Disabled' : 'Active'}
                      </span>
                      {expirations[u.id] && (
                        <span className="text-[10px] text-gray-400 font-medium ml-auto truncate" title={new Date(expirations[u.id]).toLocaleString()}>
                          Exp: {new Date(expirations[u.id]).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function formatForDatetimeLocal(val?: string) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function UserEditForm({ 
  user, 
  isCreating, 
  onSaved, 
  onCancel, 
  token, 
  expirations,
  lockout,
  onLockoutReset
}: { 
  user: any, 
  isCreating: boolean, 
  onSaved: () => void, 
  onCancel: () => void, 
  token: string, 
  expirations: Record<string, string>,
  lockout?: { failedAttempts: number, locked: boolean, lockedAt?: number, lastAttemptAt?: number },
  onLockoutReset?: () => Promise<void> | void
}) {
  const [formData, setFormData] = useState({
    ...user,
    permission: typeof user.permission === 'number' ? user.permission : 0,
    password: '',
    expirationDate: formatForDatetimeLocal(expirations[user.id])
  });
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resettingLockout, setResettingLockout] = useState(false);

  const isAdmin = user.role === 2 || user.username?.toLowerCase() === 'admin';
  const isLocked = !isAdmin && !!lockout?.locked;
  const failedAttempts = (!isAdmin && lockout?.failedAttempts) || 0;

  const handleResetLockout = async () => {
    setResettingLockout(true);
    try {
      const res = await axios.post('/api/users/reset-lockout', {
        username: user.username,
        userId: user.id,
        reEnable: true
      }, { headers: { Authorization: token } });

      if (res.data?.success) {
        if (formData.disabled) {
          setFormData(prev => ({ ...prev, disabled: false }));
        }
        await onLockoutReset?.();
        alert(`Lockout successfully reset for ${user.username}! Failed login attempts have been cleared.`);
      } else {
        alert(`Failed to reset lockout: ${res.data?.message || 'Server error'}`);
      }
    } catch (e: any) {
      alert(`Failed to reset lockout: ${e.response?.data?.message || e.message}`);
    } finally {
      setResettingLockout(false);
    }
  };

  useEffect(() => {
    setFormData({
      ...user,
      permission: typeof user.permission === 'number' ? user.permission : 0,
      password: '',
      expirationDate: formatForDatetimeLocal(expirations[user.id])
    });
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
        const createRes = await axios.post('/api/admin/user/create', {
          username: formData.username,
          password: formData.password,
          base_path: formData.base_path,
          role: formData.role || 0,
          disabled: !!formData.disabled,
          permission: formData.permission || 0
        }, { headers: { Authorization: token } });
        
        if (createRes.data?.code !== 200) {
          alert(`Failed to create user: ${createRes.data?.message || 'Server error'}`);
          setSaving(false);
          return;
        }

        if (createRes.data?.data?.id) {
          createdUserId = createRes.data.data.id;
        } else {
          const listRes = await axios.get('/api/admin/user/list?refresh=true', { headers: { Authorization: token } });
          const newUsers = listRes.data?.data?.content || [];
          const createdUser = newUsers.find((nu: any) => nu.username === formData.username);
          if (createdUser) createdUserId = createdUser.id;
        }
      } else {
        const updateRes = await axios.post('/api/admin/user/update', {
          id: formData.id,
          username: formData.username,
          password: formData.password || undefined,
          base_path: formData.base_path,
          role: formData.role || 0,
          disabled: !!formData.disabled,
          permission: formData.permission || 0
        }, { headers: { Authorization: token } });

        if (updateRes.data?.code !== 200) {
          alert(`Failed to update user: ${updateRes.data?.message || 'Server error'}`);
          setSaving(false);
          return;
        }
      }
      
      const targetUserId = isCreating ? createdUserId : formData.id;
      if (targetUserId) {
        const isoExpiration = formData.expirationDate ? new Date(formData.expirationDate).toISOString() : '';
        await axios.post('/api/users/expirations', {
          userId: targetUserId,
          expirationDate: isoExpiration
        }, { headers: { Authorization: token } });
      }

      alert(`User ${isCreating ? 'created' : 'updated'} successfully!`);
      onSaved();
    } catch (e: any) {
      alert(`Failed to ${isCreating ? 'create' : 'update'} user: ${e.response?.data?.message || e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (bit: number) => {
    const current = typeof formData.permission === 'number' ? formData.permission : 0;
    const isSet = (current & bit) === bit;
    const nextPerm = isSet ? (current & ~bit) : (current | bit);
    setFormData({ ...formData, permission: nextPerm });
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
            value={formData.username || ''}
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
              value={formData.password || ''}
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
            value={formData.base_path || '/'}
            onChange={e => setFormData({...formData, base_path: e.target.value})}
            placeholder="/"
          />
        </div>
        
        <div className="bg-white/50 dark:bg-[#08080a]/50 p-6 rounded-2xl border border-black/5 dark:border-white/5">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Account Status</label>
          <label className="flex items-center space-x-3 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={!!formData.disabled}
              onChange={e => setFormData({...formData, disabled: e.target.checked})}
              className="w-5 h-5 accent-purple-600 rounded"
            />
            <span className="text-black dark:text-white font-medium">Disable Account</span>
          </label>
        </div>

        <div className="bg-white/50 dark:bg-[#08080a]/50 p-6 rounded-2xl border border-black/5 dark:border-white/5">
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-4">Expiration Date & Time</label>
          <input 
            type="datetime-local"
            className="w-full bg-white dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:border-purple-500 focus:outline-none transition-colors"
            value={formData.expirationDate || ''}
            onChange={e => setFormData({...formData, expirationDate: e.target.value})}
          />
          <p className="text-[10px] text-gray-500 mt-2">Leave empty for no expiration. User will be disabled automatically on the set date and time.</p>
        </div>

        {/* Lockout & Security Section */}
        {!isCreating && (
          isAdmin ? (
            <div className="md:col-span-2 bg-blue-500/10 border border-blue-500/20 rounded-2xl p-6 flex items-start gap-4">
              <div className="p-3 bg-blue-500/20 rounded-xl text-blue-500 shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-bold text-black dark:text-white">Admin Account</h4>
                  <span className="text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">Lockout Exempt</span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
                  Unsuccessful login attempt restrictions are removed for administrator accounts. This account cannot be locked out due to failed login attempts.
                </p>
              </div>
            </div>
          ) : (
            <div className={`md:col-span-2 p-6 rounded-2xl border transition-all ${
              isLocked 
                ? 'bg-red-500/10 border-red-500/30' 
                : (failedAttempts > 0)
                  ? 'bg-amber-500/10 border-amber-500/30'
                  : 'bg-white/50 dark:bg-[#08080a]/50 border-black/5 dark:border-white/5'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Login Lockout Status</label>
                    {isLocked ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white shadow-sm">
                        <Lock className="w-3 h-3" /> Locked Out
                      </span>
                    ) : (failedAttempts > 0) ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        <AlertTriangle className="w-3 h-3" /> {failedAttempts} / 5 Failed Attempts
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/20">
                        <Unlock className="w-3 h-3" /> Normal (0 Failed Attempts)
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    {isLocked 
                      ? `This non-admin account is currently locked out after ${failedAttempts} unsuccessful login attempts. The user cannot log in until the lockout is reset.`
                      : (failedAttempts > 0)
                        ? `${failedAttempts} unsuccessful login attempt${failedAttempts === 1 ? '' : 's'} recorded. Account locks automatically after 5 consecutive failures.`
                        : 'No unsuccessful login attempts recorded. User account is in good standing.'}
                  </p>

                  {lockout?.lockedAt && (
                    <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                      <span>Locked at: {new Date(lockout.lockedAt).toLocaleString()}</span>
                    </p>
                  )}
                </div>

                {/* Reset Lockout Button */}
                {(isLocked || failedAttempts > 0) && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleResetLockout}
                      disabled={resettingLockout}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg shadow-red-600/20 disabled:opacity-50 cursor-pointer"
                    >
                      {resettingLockout ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                      <span>{isLocked ? 'Reset Lockout & Unlock' : 'Clear Failed Attempts'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </div>

      <div className="pt-8 border-t border-black/5 dark:border-white/5">
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-6">Permissions</label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
          {permissionsList.map(p => {
            const isChecked = ((formData.permission || 0) & p.bit) === p.bit;
            return (
              <button
                key={p.bit} 
                type="button"
                onClick={() => togglePermission(p.bit)}
                className="flex items-center space-x-3 cursor-pointer group text-left focus:outline-none"
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors shrink-0 ${isChecked ? 'bg-purple-600 border-purple-600' : 'bg-transparent border-gray-400 group-hover:border-purple-500'}`}>
                  {isChecked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-black dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{p.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="pt-8 flex justify-end gap-4">
        <button 
          type="button"
          onClick={onCancel}
          className="bg-black/5 dark:bg-white/5 text-black dark:text-white font-bold px-10 py-4 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all flex items-center"
        >
          Back to Users
        </button>
        <button 
          type="button"
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
