import React from 'react';
import { useStore } from '../../store/useStore';
import { Award, ShieldCheck, Zap, Star, Loader2, AlertCircle, TrendingUp, Clock, Medal } from 'lucide-react';

export const ParentBadges: React.FC = () => {
    const { badges } = useStore();
    const loading = false;
    const error = ''; 

    const getIcon = (code: string) => {
        switch (code) {
            case 'welcome':    return <ShieldCheck className="w-8 h-8" />;
            case 'half_paid':  return <Zap className="w-8 h-8" />;
            case 'fully_paid': return <Star className="w-8 h-8" />;
            case 'excellence': return <TrendingUp className="w-8 h-8" />;
            case 'attendance': return <Clock className="w-8 h-8" />;
            default:           return <Award className="w-8 h-8" />;
        }
    };

    const getTheme = (code: string) => {
        switch (code) {
            case 'welcome':    return 'from-blue-500 to-indigo-600 shadow-blue-200';
            case 'half_paid':  return 'from-orange-400 to-amber-600 shadow-orange-200';
            case 'fully_paid': return 'from-emerald-400 to-teal-600 shadow-emerald-200';
            case 'excellence': return 'from-purple-500 to-fuchsia-600 shadow-purple-200';
            case 'attendance': return 'from-sky-400 to-blue-500 shadow-sky-200';
            default:           return 'from-slate-400 to-slate-600 shadow-slate-200';
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                <p className="text-slate-500 font-medium">Récupération de vos trophées...</p>
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-10">
            {/* Header section with glassmorphism */}
            <div className="relative overflow-hidden bg-gradient-to-br from-indigo-900 to-blue-900 rounded-[40px] p-8 md:p-12 text-white shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/20 rounded-full translate-y-1/2 -translate-x-1/3 blur-3xl" />
                
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                    <div className="w-24 h-24 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center border border-white/20 shadow-inner">
                        <Medal className="w-12 h-12 text-amber-400" />
                    </div>
                    <div className="text-center md:text-left">
                        <h2 className="text-3xl md:text-5xl font-black tracking-tight mb-3">Trophées & Succès</h2>
                        <p className="text-indigo-100 text-lg opacity-80 max-w-xl font-medium leading-relaxed">
                            Célébrez l'excellence de vos enfants et votre engagement. Chaque badge est une marque de confiance et de réussite.
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border-2 border-red-100 rounded-3xl p-6 text-red-700 flex items-center gap-4 animate-shake">
                    <AlertCircle className="w-6 h-6 shrink-0" />
                    <p className="font-bold">{error}</p>
                </div>
            )}

            {/* Badges Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {badges.length === 0 ? (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center bg-slate-50 border-4 border-dashed border-slate-200 rounded-[40px]">
                        <Award className="w-16 h-16 text-slate-300 mb-4" />
                        <p className="text-slate-400 font-bold text-xl">Vos trophées apparaîtront ici.</p>
                        <p className="text-slate-400 text-sm">Continuez à suivre l'évolution de vos enfants !</p>
                    </div>
                ) : (
                    badges.map((badge) => (
                        <div
                            key={badge.id}
                            className="group relative bg-white rounded-[32px] p-8 flex flex-col items-center text-center transition-all duration-500 hover:-translate-y-2 border border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-indigo-500/10"
                        >
                            {/* Glow Effect */}
                            <div className={`absolute inset-0 bg-gradient-to-br ${getTheme(badge.code)} opacity-0 group-hover:opacity-[0.03] rounded-[32px] transition-opacity`} />
                            
                            {/* Icon Container */}
                            <div className={`relative w-24 h-24 rounded-3xl bg-gradient-to-br ${getTheme(badge.code)} shadow-2xl flex items-center justify-center text-white mb-6 transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-500`}>
                                <div className="absolute inset-0 bg-white opacity-20 rounded-3xl blur-sm group-hover:blur-md transition-all" />
                                <div className="relative z-10 drop-shadow-lg">
                                    {getIcon(badge.code)}
                                </div>
                            </div>

                            <h3 className="font-black text-xl mb-3 text-slate-800 tracking-tight group-hover:text-indigo-600 transition-colors">
                                {badge.label}
                            </h3>

                            <p className="text-slate-500 text-sm leading-relaxed font-medium mb-6">
                                {badge.description}
                            </p>

                            {badge.student_prenom && (
                                <div className="mb-6 px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black uppercase tracking-widest">
                                    En lien avec : {badge.student_prenom}
                                </div>
                            )}

                            <div className="mt-auto w-full pt-6 border-t border-slate-50">
                                <div className="flex items-center justify-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Clock className="w-3 h-3" />
                                    Obtenu le {new Date(badge.earned_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Motivational message */}
            <div className="bg-slate-50 rounded-[40px] p-8 text-center border border-slate-100">
                <p className="text-slate-500 font-medium italic">
                    "L'éducation est l'arme la plus puissante pour changer le monde." - Nelson Mandela
                </p>
            </div>
        </div>
    );
};
