// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { 
  User, 
  Mail, 
  Shield, 
  Save,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '../supabase';

export default function Profile({ user }: { user: any }) {
  const [profile, setProfile] = useState<any>(null);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      setProfile(data);
      setName(data.name || '');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name })
        .eq('id', user.id);
      
      if (error) throw error;
      
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
        <p className="text-gray-500">Gerencie suas informações pessoais e configurações.</p>
      </header>

      <div className="bg-white rounded-3xl shadow-xl border border-orange-100 overflow-hidden">
        <div className="p-8 bg-orange-50/50 border-b border-orange-100 flex items-center gap-6">
          <img 
            src={user.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${name || user.email}`} 
            alt="Avatar" 
            className="w-24 h-24 rounded-full border-4 border-white shadow-lg"
          />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{name || 'Usuário'}</h2>
            <p className="text-gray-500 flex items-center gap-2">
              <Mail className="w-4 h-4" /> {user.email}
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Nome Completo</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="text" 
                  className="w-full pl-12 pr-4 py-3 bg-orange-50 border-none rounded-2xl focus:ring-2 focus:ring-orange-500 outline-none"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="email" 
                  disabled
                  className="w-full pl-12 pr-4 py-3 bg-gray-100 border-none rounded-2xl text-gray-500 cursor-not-allowed"
                  value={user.email}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">O e-mail não pode ser alterado.</p>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Cargo / Permissão</label>
              <div className="relative">
                <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input 
                  type="text" 
                  disabled
                  className="w-full pl-12 pr-4 py-3 bg-gray-100 border-none rounded-2xl text-gray-500 cursor-not-allowed"
                  value={profile.role === 'admin' ? 'Administrador' : 'Usuário'}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-200 transition-all flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Alterações
              </>
            )}
          </button>
        </form>
      </div>

      {showSuccess && (
        <div className="fixed bottom-8 right-8 bg-green-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-8 duration-300">
          <CheckCircle2 className="w-6 h-6" />
          <p className="font-bold">Perfil atualizado com sucesso!</p>
        </div>
      )}
    </div>
  );
}
