// LoginScreen.jsx — Login con Google / Apple
const LoginScreen = ({ onLogin }) => {
  return (
    <div className="screen-enter" style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '60px 28px 40px',
      background: 'linear-gradient(180deg, #F8FBFC 0%, #FFFFFF 100%)',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)',
        width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(8,145,178,0.14), transparent 60%)',
        pointerEvents: 'none',
      }}/>

      {/* Logo centerpiece */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        <div style={{
          width: 84, height: 84, borderRadius: '50%', overflow: 'hidden',
          boxShadow: '0 20px 48px rgba(8,145,178,0.30)',
        }}>
          <div className="v-mark"><VMark size={54} /></div>
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 800,
          fontSize: 34, letterSpacing: '-0.03em',
          color: 'var(--ink-900)', marginTop: 22,
        }}>vita<span style={{ color: 'var(--teal-600)' }}>.ia</span></div>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 15,
          color: 'var(--ink-500)', marginTop: 8, textAlign: 'center',
          maxWidth: 280, lineHeight: 1.4,
        }}>
          Tu historial de salud, inteligente.
        </div>
      </div>

      {/* Auth buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, zIndex: 1 }}>
        <button className="btn btn-oauth btn-block" onClick={() => onLogin('google')}>
          <Icon name="google" size={20} />
          <span>Continuar con Google</span>
        </button>
        <button className="btn btn-oauth dark btn-block" onClick={() => onLogin('apple')}>
          <Icon name="apple" size={20} />
          <span>Continuar con Apple</span>
        </button>

        {/* Connections explainer */}
        <div style={{
          marginTop: 18,
          background: 'var(--surface-sunk)',
          borderRadius: 'var(--r-md)',
          padding: '14px 16px',
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <div className="row gap-2" style={{ flexShrink: 0 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10, background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(15,33,54,0.06)',
            }}>
              <Icon name="heart-plus" size={17} color="#FF3B30" />
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: 10, background: '#fff', marginLeft: -10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(15,33,54,0.06)',
            }}>
              <Icon name="activity" size={17} color="#4285F4" />
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.4 }}>
            Nos conectamos con tu app de Salud y relojes para traer tu data automáticamente.
          </div>
        </div>

        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 11.5,
          color: 'var(--ink-400)', textAlign: 'center',
          marginTop: 14, lineHeight: 1.5,
        }}>
          Al continuar, aceptás los <span style={{ color: 'var(--teal-700)', fontWeight: 600 }}>Términos</span> y <span style={{ color: 'var(--teal-700)', fontWeight: 600 }}>Política de Privacidad</span>.
        </div>
      </div>
    </div>
  );
};

window.LoginScreen = LoginScreen;
