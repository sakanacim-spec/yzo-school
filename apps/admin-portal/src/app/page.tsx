import React from 'react';

export default function AdminLogin() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden text-white">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl aspect-square bg-indigo-500/20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="relative z-10 w-full max-w-md p-8 bg-gray-900/50 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">
            Oziow Admin
          </h1>
          <p className="text-sm text-gray-400">SaaS Platform Management Portal</p>
        </div>

        <form className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Email Address
            </label>
            <input 
              type="email" 
              placeholder="admin@oziow.com" 
              className="w-full px-4 py-2.5 bg-gray-950/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <input 
              type="password" 
              placeholder="••••••••" 
              className="w-full px-4 py-2.5 bg-gray-950/50 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="pt-2">
            <button 
              type="button"
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg shadow-lg shadow-indigo-500/30 transition-all duration-200 transform hover:-translate-y-0.5"
            >
              Sign In to Platform
            </button>
          </div>
        </form>

        <div className="mt-8 text-center text-xs text-gray-500">
          <p>Oziow Core Platform &copy; 2026. Restricted Access.</p>
        </div>
      </div>
    </div>
  );
}
