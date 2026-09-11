// OnboardingScreens.jsx — Nombre + Chat de bienvenida con vita
const { useState: useStateOb, useEffect: useEffectOb, useRef: useRefOb } = React;

// ===== 1) Nombre =====
const OnboardingNameScreen = ({ onContinue, onSkip }) => {
  const [name, setName] = useStateOb('');
  const inputRef = useRefOb(null);

  useEffectOb(() => { inputRef.current && inputRef.current.focus(); }, []);

  return (
    <div className="screen-enter" style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '56px 28px 32px',
      background: 'linear-gradient(180deg, #F8FBFC 0%, #FFFFFF 100%)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* glow */}
      <div style={{
        position: 'absolute', top: -140, left: '50%', transform: 'translateX(-50%)',
        width: 340, height: 340, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(8,145,178,0.12), transparent 60%)',
        pointerEvents: 'none',
      }}/>

      {/* Top: steps + skip */}
      <div className="row between" style={{ zIndex: 1 }}>
        <StepDots total={3} active={0} />
        <span className="link" onClick={onSkip}>Omitir</span>
      </div>

      {/* Logo */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28, zIndex: 1 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', overflow: 'hidden',
          boxShadow: '0 14px 36px rgba(8,145,178,0.28)',
        }}>
          <div className="v-mark"><VMark size={42} /></div>
        </div>
      </div>

      {/* Copy */}
      <div style={{ textAlign: 'center', marginTop: 30, zIndex: 1 }}>
        <div className="h-display" style={{ fontSize: 26, color: 'var(--ink-900)' }}>¿Cómo te llamás?</div>
        <div className="t-meta" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>
          Así te voy a llamar dentro de la app.
        </div>
      </div>

      {/* Input */}
      <div style={{ marginTop: 28, zIndex: 1 }}>
        <input
          ref={inputRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) onContinue(name.trim()); }}
          placeholder="Tu nombre"
          className="input"
          style={{ textAlign: 'center', fontSize: 17, fontWeight: 600 }}
        />
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }}/>

      {/* Continue */}
      <button
        className="btn btn-primary btn-block"
        onClick={() => name.trim() && onContinue(name.trim())}
        disabled={!name.trim()}
        style={{
          opacity: name.trim() ? 1 : 0.55,
          cursor: name.trim() ? 'pointer' : 'default',
          zIndex: 1,
        }}>
        Continuar
      </button>
    </div>
  );
};

const StepDots = ({ total, active }) => (
  <div className="row gap-2" style={{ alignItems: 'center' }}>
    {Array.from({ length: total }).map((_, i) => (
      <span key={i} style={{
        width: i === active ? 20 : 6, height: 6, borderRadius: 999,
        background: i === active ? 'var(--teal-600)' : 'var(--ink-200)',
        transition: 'all 0.3s ease',
      }}/>
    ))}
  </div>
);

// ===== 2) Chat onboarding =====
const OnboardingChatScreen = ({ userName, onComplete, onSkip }) => {
  // Script of vita questions
  const script = [
    { id: 'greet', text: `Hola ${userName} 👋 Soy vita, tu asistente de salud. Voy a ayudarte a llevar tu historial al día.` },
    { id: 'age', text: '¿Cuántos años tenés?', chips: ['Menos de 30', '30–45', 'Más de 45'] },
    { id: 'cond', text: '¿Tenés alguna condición de salud?', chips: ['Diabetes', 'Hipertensión', 'Alergias', 'Ninguna por ahora'] },
    { id: 'meds', text: '¿Tomás algún medicamento regularmente?', chips: ['Sí, varios', 'Uno solo', 'No por ahora'] },
    { id: 'done', text: 'Listo ✨ Ya puedo empezar a ayudarte. Podés completar el resto cuando quieras desde tu perfil.', final: true },
  ];

  const [step, setStep] = useStateOb(0);
  const [messages, setMessages] = useStateOb([]);
  const [input, setInput] = useStateOb('');
  const [typing, setTyping] = useStateOb(false);
  const scrollRef = useRefOb(null);

  // Queue vita messages one at a time with typing
  useEffectOb(() => {
    const current = script[step];
    if (!current) return;

    setTyping(true);
    const t1 = setTimeout(() => {
      setTyping(false);
      setMessages(ms => [...ms, { from: 'vita', ...current, id: `v-${step}` }]);
      if (current.final) {
        setTimeout(() => onComplete && onComplete(), 1400);
      }
    }, step === 0 ? 500 : 900);

    return () => clearTimeout(t1);
  }, [step]);

  useEffectOb(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const reply = (text) => {
    setMessages(ms => [...ms, { from: 'user', text, id: `u-${Date.now()}` }]);
    setInput('');
    if (step < script.length - 1) setTimeout(() => setStep(s => s + 1), 400);
  };

  return (
    <div className="screen-enter" style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(600px 280px at 50% -40px, rgba(8,145,178,0.12), transparent 60%)',
      }}/>

      {/* Header: steps + skip */}
      <div className="row between" style={{ padding: '18px 24px 12px', zIndex: 2 }}>
        <StepDots total={3} active={2} />
        <span className="link" onClick={onSkip}>Omitir</span>
      </div>

      {/* vita chip ID */}
      <div style={{ textAlign: 'center', marginTop: 4, zIndex: 2 }}>
        <div className="row gap-2" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <VitaAvatar size={30} />
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink-900)' }}>vita</div>
        </div>
        <div className="t-meta" style={{ fontSize: 11.5, marginTop: 2 }}>conociéndote</div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto',
        padding: '16px 16px 8px',
        display: 'flex', flexDirection: 'column', gap: 10,
        zIndex: 1,
      }}>
        {messages.map((m, i) => {
          const isLastVita = m.from === 'vita' && i === messages.length - 1 && m.chips && !typing;
          return <OnbMessage key={m.id} m={m} showChips={isLastVita} onPick={reply} />;
        })}
        {typing && <TypingBubbleOnb />}
      </div>

      {/* Footer note + input */}
      <div style={{ padding: '6px 18px 0', textAlign: 'center', zIndex: 2 }}>
        <div className="t-meta" style={{ fontSize: 11, color: 'var(--ink-400)' }}>
          Podés completar esto después desde tu perfil
        </div>
      </div>
      <div style={{ padding: '10px 14px 30px', zIndex: 2 }}>
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-pill)',
          padding: '6px 6px 6px 18px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 8px 24px rgba(15,33,54,0.08), inset 0 0 0 1px rgba(15,33,54,0.03)',
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && input.trim()) reply(input.trim()); }}
            placeholder={typing ? 'vita está escribiendo…' : 'Escribí tu respuesta…'}
            disabled={typing}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--ink-900)',
              minWidth: 0, padding: '8px 0',
            }}/>
          <button style={{
            border: 'none', width: 40, height: 40, borderRadius: '50%',
            background: 'var(--surface-sunk)', color: 'var(--ink-500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}>
            <Icon name="mic" size={18} />
          </button>
          <button onClick={() => input.trim() && reply(input.trim())}
            disabled={!input.trim() || typing}
            style={{
              border: 'none', width: 44, height: 44, borderRadius: '50%',
              background: (input.trim() && !typing)
                ? 'linear-gradient(135deg, var(--teal-500), var(--teal-700))'
                : 'var(--surface-sunk)',
              color: (input.trim() && !typing) ? '#fff' : 'var(--ink-300)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: (input.trim() && !typing) ? 'pointer' : 'default', flexShrink: 0,
              boxShadow: (input.trim() && !typing) ? '0 6px 14px rgba(8,145,178,0.35)' : 'none',
              transition: 'all 0.15s ease',
            }}>
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

const OnbMessage = ({ m, showChips, onPick }) => {
  if (m.from === 'user') {
    return (
      <div className="msg-in" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '78%',
          background: 'linear-gradient(135deg, var(--teal-500), var(--teal-700))',
          color: '#fff', padding: '10px 14px',
          borderRadius: '20px 20px 6px 20px',
          fontFamily: 'var(--font-body)', fontSize: 14.5, lineHeight: 1.4,
          boxShadow: '0 6px 14px rgba(8,145,178,0.22)',
          wordBreak: 'break-word',
        }}>{m.text}</div>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="msg-in" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <VitaAvatar size={26} />
        <div style={{
          maxWidth: '80%',
          background: 'var(--surface)', color: 'var(--ink-900)',
          padding: '10px 14px', borderRadius: '20px 20px 20px 6px',
          fontFamily: 'var(--font-body)', fontSize: 14.5, lineHeight: 1.45,
          boxShadow: 'var(--shadow-card)',
        }}>{m.text}</div>
      </div>
      {showChips && m.chips && (
        <div className="msg-in" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingLeft: 34 }}>
          {m.chips.map(c => (
            <button key={c} onClick={() => onPick(c)} style={{
              border: 'none',
              background: 'var(--surface)',
              boxShadow: 'inset 0 0 0 1px var(--teal-200)',
              color: 'var(--teal-700)',
              padding: '8px 14px', borderRadius: 'var(--r-pill)',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
              cursor: 'pointer',
            }}>{c}</button>
          ))}
        </div>
      )}
    </div>
  );
};

const TypingBubbleOnb = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
    <VitaAvatar size={26} />
    <div style={{
      background: 'var(--surface)', padding: '12px 16px',
      borderRadius: '20px 20px 20px 6px',
      boxShadow: 'var(--shadow-card)',
      display: 'flex', gap: 4,
    }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--teal-600)',
          animation: `dot-pulse 1.2s ease-in-out ${i * 0.15}s infinite`,
        }}/>
      ))}
    </div>
    <style>{`@keyframes dot-pulse { 0%,80%,100% { opacity: 0.25; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } } @keyframes msg-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } } .msg-in { animation: msg-in 0.25s ease both; }`}</style>
  </div>
);

window.OnboardingNameScreen = OnboardingNameScreen;
window.OnboardingChatScreen = OnboardingChatScreen;
