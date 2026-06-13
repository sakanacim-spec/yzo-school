// ============================================================
// AUDIO UTILS — Sons de notification (Optimisé Performance)
// ============================================================

let _audioCtx: AudioContext | null = null;
let _iphBuffer: AudioBuffer | null = null;

const getCtx = (): AudioContext => {
    if (!_audioCtx) {
        _audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return _audioCtx;
};

/**
 * À appeler UNE FOIS sur un clic utilisateur (ex: bouton "Activer caméra").
 * Déverrouille l'AudioContext et pré-charge iph.mp3 dans un buffer.
 */
export const unlockAudio = async () => {
    try {
        const ctx = getCtx();
        
        // Trick Safari/Chrome : Jouer un silence immédiat sur le clic
        const silentOsc = ctx.createOscillator();
        const silentGain = ctx.createGain();
        silentGain.gain.value = 0;
        silentOsc.connect(silentGain);
        silentGain.connect(ctx.destination);
        silentOsc.start(0);
        silentOsc.stop(0.001);

        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        
        if (!_iphBuffer) {
            const response = await fetch('/iph.mp3');
            if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                _iphBuffer = await ctx.decodeAudioData(arrayBuffer);
            }
        }
    } catch (err) {
        console.warn('Audio unlock failed:', err);
    }
};

/**
 * Assure que le contexte est actif avant de jouer quoi que ce soit.
 * Crucial pour éliminer la latence sur mobile.
 */
const ensureActiveCtx = async (ctx: AudioContext) => {
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }
};

/**
 * Fallback bip simple (Sine wave).
 */
export const playBeep = async () => {
    try {
        const ctx = getCtx();
        await ensureActiveCtx(ctx);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (err) {
        // Silencieux
    }
};

/**
 * Joue le son de validation spécifique (iph.mp3).
 * Priorité max sur la vitesse d'exécution.
 */
export const playSuccessSound = async () => {
    try {
        const ctx = getCtx();
        await ensureActiveCtx(ctx);
        
        if (_iphBuffer) {
            const source = ctx.createBufferSource();
            source.buffer = _iphBuffer;
            source.connect(ctx.destination);
            source.start(0);
        } else {
            // Fallback vers bip si pas encore chargé
            playBeep();
            // Tentative asynchrone pour charger l'audio pour la prochaine fois
            unlockAudio();
        }
    } catch (err) {
        playBeep();
    }
};

/**
 * Joue un son d'erreur (buzzer aggressif).
 */
export const playErrorSound = async () => {
    try {
        const ctx = getCtx();
        await ensureActiveCtx(ctx);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
        // Silencieux
    }
};

/**
 * Bip d'avertissement tonalité descendante rapide.
 */
export const playWarningBeep = async () => {
    try {
        const ctx = getCtx();
        await ensureActiveCtx(ctx);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(330, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch (err) {
        // Silencieux
    }
};

