// VitaChat.jsx — Full-screen modal chat with vita
const VitaChat = ({ userName = 'Sofía', onClose, seed }) => {
  // Seed: optional initial topic (e.g. launched from a specific screen)
  const initialMessages = [
    { id: 1, from: 'vita', kind: 'text', text: `Hola ${userName} 👋 Soy vita. ¿Cómo puedo ayudarte hoy?` },
    { id: 2, from: 'vita', kind: 'chips', chips: [
      'Agregar medicamento',
      'Registrar presión',
      '¿Cómo vengo esta semana?',
      'Agendar turno',
    ]},
  ];

  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    // scroll to bottom on new msg
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const now = () => new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const send = async (text) => {
    if (!text || !text.trim()) return;
    const userMsg = { id: Date.now(), from: 'user', kind: 'text', text: text.trim(), time: now() };
    setMessages(m => [...m.filter(x => x.kind !== 'chips'), userMsg]);
    setInput('');
    setTyping(true);

    // Try to intercept obvious structured intents (demo logic)
    const lower = text.toLowerCase();
    let structured = null;
    if (/presi[oó]n/.test(lower) && /\d+\s*\/\s*\d+/.test(lower)) {
      const match = lower.match(/(\d+)\s*\/\s*(\d+)/);
      structured = { kind: 'measurement-saved', metric: 'Presión arterial', value: `${match[1]}/${match[2]}`, unit: 'mmHg' };
    } else if (/agreg[aá]/.test(lower) && /(metformina|losart[aá]n|vitamina|omega|ibuprofeno|paracetamol)/.test(lower)) {
      const med = lower.match(/(metformina|losart[aá]n|vitamina\s*d?|omega\s*3?|ibuprofeno|paracetamol)/i)[0];
      structured = { kind: 'med-created', name: med.charAt(0).toUpperCase() + med.slice(1), dose: '—', time: '08:00' };
    } else if (/turno|cita/.test(lower)) {
      structured = { kind: 'appointment-suggested', title: 'Turno médico', note: 'Te muestro cómo lo agendo' };
    }

    // Build prompt context
    const systemContext = `Sos vita, una asistente de salud personal conversacional, cálida y breve. Hablás en español rioplatense, usás "vos". Usuaria: ${userName} Álvarez, 34 años, con hipertensión y SIBO, alérgica a penicilina. Medicamentos activos: Metformina 500mg, Losartán 50mg (2 tomas), Vitamina D, Omega 3. Respondé en 1-2 oraciones, concreto. Si el usuario pide agendar/registrar algo, confirmá que lo hiciste. No uses markdown. No uses listas largas.`;

    try {
      const response = await window.claude.complete({
        messages: [
          { role: 'user', content: `${systemContext}\n\n${userName}: ${text}` }
        ],
      });
      const reply = response.trim();

      // Compose vita's reply: if we detected a structured action, emit a card + text
      setTyping(false);
      if (structured) {
        setMessages(m => [
          ...m,
          { id: Date.now() + 1, from: 'vita', kind: 'action-card', data: structured, time: now() },
          { id: Date.now() + 2, from: 'vita', kind: 'text', text: reply || 'Listo ✨', time: now() },
        ]);
      } else {
        setMessages(m => [
          ...m,
          { id: Date.now() + 1, from: 'vita', kind: 'text', text: reply || 'Mmm, dejame ver eso de nuevo.', time: now() },
        ]);
      }
    } catch (err) {
      setTyping(false);
      setMessages(m => [
        ...m,
        { id: Date.now() + 1, from: 'vita', kind: 'text', text: 'No pude responder en este momento. Probá de nuevo.', time: now() },
      ]);
    }
  };

  const pickChip = (text) => send(text);

  const toggleMic = () => {
    setListening(l => !l);
    if (!listening) {
      // Demo: after 2s, drop a transcript in the input
      setTimeout(() => {
        setListening(false);
        setInput('Registrame presión 128 sobre 82');
        inputRef.current && inputRef.current.focus();
      }, 2000);
    }
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'var(--bg)',
      animation: 'chat-in 0.32s cubic-bezier(0.2, 0.9, 0.2, 1)',
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes chat-in { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes dot-pulse { 0%,80%,100% { opacity: 0.25; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }
        @keyframes msg-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .msg-in { animation: msg-in 0.25s ease both; }
      `}</style>

      {/* Ambient teal glow background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(600px 300px at 50% -50px, rgba(8,145,178,0.15), transparent 60%)',
      }}/>

      {/* Header */}
      <div style={{
        position: 'relative', zIndex: 2,
        padding: '58px 20px 14px',
        background: 'var(--surface)',
        boxShadow: '0 4px 20px rgba(15,33,54,0.04)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <VitaAvatar size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--ink-900)' }}>vita</div>
          <div className="row gap-2" style={{ alignItems: 'center' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)' }}/>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--ink-400)', fontWeight: 500 }}>
              {typing ? 'pensando…' : listening ? 'te escucho' : 'en línea · siempre disponible'}
            </span>
          </div>
        </div>
        <div className="icon-btn" onClick={onClose} style={{ background: 'var(--surface-sunk)', boxShadow: 'none' }}>
          <Icon name="close" size={18} />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '18px 16px 20px',
        display: 'flex', flexDirection: 'column', gap: 10,
        position: 'relative',
      }}>
        <div style={{ textAlign: 'center', padding: '4px 0 8px' }}>
          <span className="t-meta" style={{ fontSize: 11 }}>Hoy · {now()}</span>
        </div>

        {messages.map(m => <Message key={m.id} m={m} onPick={pickChip} />)}

        {typing && <TypingBubble />}
      </div>

      {/* Input bar — glassmorphism */}
      <div style={{
        position: 'relative', zIndex: 2,
        padding: '12px 14px 30px',
        background: 'linear-gradient(to top, var(--surface) 60%, transparent)',
      }}>
        <div style={{
          background: 'var(--surface)',
          borderRadius: 'var(--r-pill)',
          padding: '6px 6px 6px 18px',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 8px 24px rgba(15,33,54,0.08), inset 0 0 0 1px rgba(15,33,54,0.03)',
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(input); }}
            placeholder="Contame…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--ink-900)',
              minWidth: 0, padding: '8px 0',
            }}
          />
          <button onClick={toggleMic} style={{
            border: 'none', width: 40, height: 40, borderRadius: '50%',
            background: listening ? 'var(--chip-rose-bg)' : 'var(--surface-sunk)',
            color: listening ? 'var(--danger)' : 'var(--ink-500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
            transition: 'all 0.15s ease',
          }}>
            {listening ? <MicPulse /> : <Icon name="mic" size={18} />}
          </button>
          <button
            onClick={() => send(input)}
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

const Message = ({ m, onPick }) => {
  if (m.from === 'user') {
    return (
      <div className="msg-in" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '78%',
          background: 'linear-gradient(135deg, var(--teal-500), var(--teal-700))',
          color: '#fff',
          padding: '10px 14px',
          borderRadius: '20px 20px 6px 20px',
          fontFamily: 'var(--font-body)', fontSize: 14.5, lineHeight: 1.4,
          boxShadow: '0 6px 14px rgba(8,145,178,0.22)',
          wordBreak: 'break-word',
        }}>
          {m.text}
        </div>
      </div>
    );
  }

  if (m.kind === 'text') {
    return (
      <div className="msg-in" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <VitaAvatar size={26} />
        <div style={{
          maxWidth: '78%',
          background: 'var(--surface)',
          color: 'var(--ink-900)',
          padding: '10px 14px',
          borderRadius: '20px 20px 20px 6px',
          fontFamily: 'var(--font-body)', fontSize: 14.5, lineHeight: 1.45,
          boxShadow: 'var(--shadow-card)',
          wordBreak: 'break-word',
        }}>
          {m.text}
        </div>
      </div>
    );
  }

  if (m.kind === 'chips') {
    return (
      <div className="msg-in" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '4px 0 0 34px' }}>
        {m.chips.map(c => (
          <button key={c} onClick={() => onPick(c)} style={{
            border: 'none',
            background: 'var(--surface)',
            boxShadow: 'inset 0 0 0 1px var(--teal-200)',
            color: 'var(--teal-700)',
            padding: '8px 14px',
            borderRadius: 'var(--r-pill)',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }} onMouseEnter={e => e.currentTarget.style.background = 'var(--chip-teal-bg)'}
             onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}>
            {c}
          </button>
        ))}
      </div>
    );
  }

  if (m.kind === 'action-card') {
    return (
      <div className="msg-in" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <VitaAvatar size={26} />
        <ActionCard data={m.data} />
      </div>
    );
  }

  return null;
};

const ActionCard = ({ data }) => {
  if (data.kind === 'measurement-saved') {
    return (
      <div style={{
        maxWidth: '82%', width: '82%',
        background: 'var(--surface)',
        borderRadius: '20px 20px 20px 6px',
        padding: 14,
        boxShadow: 'var(--shadow-card)',
      }}>
        <div className="row gap-2" style={{ alignItems: 'center' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--chip-teal-bg)', color: 'var(--chip-teal-ink)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="check" size={16} strokeWidth={2.4} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--ink-900)' }}>Medición guardada</div>
        </div>
        <div style={{
          marginTop: 10, background: 'var(--surface-sunk)', padding: '12px 14px',
          borderRadius: 'var(--r-sm)',
        }}>
          <div className="t-meta" style={{ fontSize: 11 }}>{data.metric}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--ink-900)', letterSpacing: '-0.02em', marginTop: 2 }}>
            {data.value} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-400)' }}>{data.unit}</span>
          </div>
        </div>
        <div className="row gap-2" style={{ marginTop: 10 }}>
          <button style={actionBtnPrimary}>Ver en Mi Salud</button>
          <button style={actionBtnGhost}>Deshacer</button>
        </div>
      </div>
    );
  }
  if (data.kind === 'med-created') {
    return (
      <div style={{
        maxWidth: '82%', width: '82%',
        background: 'var(--surface)',
        borderRadius: '20px 20px 20px 6px',
        padding: 14,
        boxShadow: 'var(--shadow-card)',
      }}>
        <div className="row gap-2" style={{ alignItems: 'center' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--chip-teal-bg)', color: 'var(--chip-teal-ink)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="pill" size={15} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--ink-900)' }}>Medicamento agregado</div>
        </div>
        <div style={{ marginTop: 10, background: 'var(--surface-sunk)', padding: '12px 14px', borderRadius: 'var(--r-sm)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink-900)' }}>{data.name}</div>
          <div className="t-meta" style={{ marginTop: 2 }}>{data.dose} · {data.time} hs · todos los días</div>
        </div>
        <div className="row gap-2" style={{ marginTop: 10 }}>
          <button style={actionBtnPrimary}>Ajustar detalles</button>
          <button style={actionBtnGhost}>Listo</button>
        </div>
      </div>
    );
  }
  if (data.kind === 'appointment-suggested') {
    return (
      <div style={{
        maxWidth: '82%', width: '82%',
        background: 'var(--surface)',
        borderRadius: '20px 20px 20px 6px',
        padding: 14,
        boxShadow: 'var(--shadow-card)',
      }}>
        <div className="row gap-2" style={{ alignItems: 'center' }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: '#ecfeff', color: '#155e75',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name="stethoscope" size={15} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--ink-900)' }}>Agendar turno</div>
        </div>
        <div style={{ marginTop: 8, fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--ink-700)', lineHeight: 1.45 }}>
          ¿Con qué especialidad? Decime profesional y fecha y lo agendo.
        </div>
        <div className="row gap-2" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <button style={actionBtnGhost}>Cardiología</button>
          <button style={actionBtnGhost}>Clínico</button>
          <button style={actionBtnGhost}>Otro</button>
        </div>
      </div>
    );
  }
  return null;
};

const actionBtnPrimary = {
  border: 'none', flex: 1,
  background: 'linear-gradient(135deg, var(--teal-500), var(--teal-700))',
  color: '#fff', padding: '9px 12px', borderRadius: 'var(--r-pill)',
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12.5,
  cursor: 'pointer', boxShadow: '0 4px 10px rgba(8,145,178,0.25)',
};
const actionBtnGhost = {
  border: 'none',
  background: 'var(--surface-sunk)',
  color: 'var(--ink-700)', padding: '9px 14px', borderRadius: 'var(--r-pill)',
  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12.5,
  cursor: 'pointer',
};

const TypingBubble = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
    <VitaAvatar size={26} />
    <div style={{
      background: 'var(--surface)',
      padding: '12px 16px',
      borderRadius: '20px 20px 20px 6px',
      boxShadow: 'var(--shadow-card)',
      display: 'flex', gap: 4,
    }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--teal-600)',
          animation: `dot-pulse 1.2s ease-in-out ${i * 0.15}s infinite`,
        }}/>
      ))}
    </div>
  </div>
);

const MicPulse = () => (
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Icon name="mic" size={18} />
    <span style={{
      position: 'absolute', inset: -6,
      borderRadius: '50%', border: '2px solid currentColor', opacity: 0.35,
      animation: 'dot-pulse 1.2s ease infinite',
    }}/>
  </div>
);

window.VitaChat = VitaChat;
