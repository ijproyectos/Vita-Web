// Icons.jsx — minimal, consistent 1.6px stroke SVG icon set
const Icon = ({ name, size = 22, color = 'currentColor', strokeWidth = 1.8, style }) => {
  const common = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    style,
  };
  switch (name) {
    case 'home':
      return (<svg {...common}><path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10.5V19a1 1 0 0 0 1 1H10v-5h4v5h3.5a1 1 0 0 0 1-1v-8.5"/></svg>);
    case 'routine':
      return (<svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg>);
    case 'heart-plus':
      return (<svg {...common}><path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 2.2-1.05 4.1-2.5 5.6"/><path d="M17.5 17.5v4M15.5 19.5h4"/></svg>);
    case 'user':
      return (<svg {...common}><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.2 4-5 7-5s5.8 1.8 7 5"/></svg>);
    case 'bell':
      return (<svg {...common}><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.2 1.2a.6.6 0 0 1-.42 1.03H4.72a.6.6 0 0 1-.42-1.03L6 16.5Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>);
    case 'edit':
      return (<svg {...common}><path d="m4 20 1-4L16.5 4.5a2.12 2.12 0 0 1 3 3L8 19l-4 1Z"/><path d="m13.5 7.5 3 3"/></svg>);
    case 'chevron-right':
      return (<svg {...common}><path d="m9 6 6 6-6 6"/></svg>);
    case 'chevron-down':
      return (<svg {...common}><path d="m6 9 6 6 6-6"/></svg>);
    case 'chevron-left':
      return (<svg {...common}><path d="m15 6-6 6 6 6"/></svg>);
    case 'pill':
      return (<svg {...common}><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-40 12 12)"/><path d="m8.5 8.5 7 7"/></svg>);
    case 'plus':
      return (<svg {...common}><path d="M12 5v14M5 12h14"/></svg>);
    case 'mic':
      return (<svg {...common}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>);
    case 'send':
      return (<svg {...common}><path d="M5 12 20 5l-4 15-5-5-6-3Z"/></svg>);
    case 'search':
      return (<svg {...common}><circle cx="11" cy="11" r="6.5"/><path d="m20 20-3.5-3.5"/></svg>);
    case 'filter':
      return (<svg {...common}><path d="M4 6h16M7 12h10M10 18h4"/></svg>);
    case 'calendar':
      return (<svg {...common}><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>);
    case 'clock':
      return (<svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg>);
    case 'paperclip':
      return (<svg {...common}><path d="m20 11.5-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l7.5-7.5"/></svg>);
    case 'doc':
      return (<svg {...common}><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h4"/></svg>);
    case 'vial':
      return (<svg {...common}><path d="M9 3v11.5a3.5 3.5 0 1 0 6 0V3M8 3h8M10 10h4"/></svg>);
    case 'stethoscope':
      return (<svg {...common}><path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 14v2a4 4 0 0 0 8 0v-3"/><circle cx="18" cy="10.5" r="2"/></svg>);
    case 'syringe':
      return (<svg {...common}><path d="m14 6 4 4M17 3l4 4M13.5 6.5 7 13a2 2 0 0 0 0 3l.5.5 3-3M4 20l3-3"/></svg>);
    case 'trend-up':
      return (<svg {...common}><path d="m4 17 6-6 4 4 6-7"/><path d="M15 8h5v5"/></svg>);
    case 'trend-down':
      return (<svg {...common}><path d="m4 7 6 6 4-4 6 7"/><path d="M15 16h5v-5"/></svg>);
    case 'check':
      return (<svg {...common}><path d="m5 12 5 5L20 7"/></svg>);
    case 'close':
      return (<svg {...common}><path d="M6 6l12 12M18 6 6 18"/></svg>);
    case 'google':
      return (<svg width={size} height={size} viewBox="0 0 24 24">
        <path d="M22 12.2c0-.78-.07-1.53-.2-2.25H12v4.26h5.62a4.8 4.8 0 0 1-2.08 3.15v2.62h3.37C20.88 18.33 22 15.56 22 12.2Z" fill="#4285F4"/>
        <path d="M12 22c2.82 0 5.19-.94 6.92-2.52l-3.37-2.62c-.93.63-2.13 1-3.55 1a6.18 6.18 0 0 1-5.81-4.29H2.7v2.7A10 10 0 0 0 12 22Z" fill="#34A853"/>
        <path d="M6.19 13.57a6 6 0 0 1 0-3.82V7.05H2.7a10 10 0 0 0 0 9.25l3.49-2.73Z" fill="#FBBC04"/>
        <path d="M12 5.88a5.43 5.43 0 0 1 3.84 1.5l2.88-2.88A9.6 9.6 0 0 0 12 2a10 10 0 0 0-9.3 5.05l3.49 2.7A6.18 6.18 0 0 1 12 5.88Z" fill="#EA4335"/>
      </svg>);
    case 'apple':
      return (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.7 12.7c0-2.7 2.2-4 2.3-4.1-1.3-1.8-3.2-2.1-3.9-2.1-1.7-.2-3.2 1-4.1 1-.9 0-2.2-1-3.6-1-1.8 0-3.6 1.1-4.5 2.7-1.9 3.4-.5 8.4 1.4 11.1 1 1.3 2 2.8 3.5 2.8 1.4 0 1.9-.9 3.6-.9 1.7 0 2.2.9 3.6.9 1.5 0 2.5-1.4 3.4-2.7 1.1-1.5 1.5-3 1.5-3.1-.1 0-2.9-1.1-2.9-4.4M14.1 4.7c.8-.9 1.3-2.2 1.1-3.5-1.1 0-2.5.8-3.3 1.7-.7.8-1.3 2.1-1.2 3.4 1.2.1 2.5-.6 3.4-1.6"/>
      </svg>);
    case 'sun':
      return (<svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>);
    case 'sunrise':
      return (<svg {...common}><path d="M8 15a4 4 0 0 1 8 0"/><path d="M3 19h18M12 3v4M5.5 8.5 7 10M18.5 8.5 17 10"/></svg>);
    case 'sunset':
      return (<svg {...common}><path d="M8 15a4 4 0 0 1 8 0"/><path d="M3 19h18M12 7V3M5.5 10 7 8.5M18.5 10 17 8.5"/></svg>);
    case 'moon':
      return (<svg {...common}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>);
    case 'sparkle':
      return (<svg {...common}><path d="M12 3v5M12 16v5M3 12h5M16 12h5M5.5 5.5 9 9M15 15l3.5 3.5M5.5 18.5 9 15M15 9l3.5-3.5"/></svg>);
    case 'gmail':
      return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M3 7.5v10A1.5 1.5 0 0 0 4.5 19H7V12L12 15.5 17 12v7h2.5A1.5 1.5 0 0 0 21 17.5v-10" stroke="#EA4335" strokeWidth="1.7" strokeLinejoin="round"/><path d="M3 7.5 12 13.5 21 7.5 19.5 6H4.5L3 7.5Z" stroke="#EA4335" strokeWidth="1.7" strokeLinejoin="round"/></svg>);
    case 'wifi':
      return (<svg {...common}><path d="M2 8a15 15 0 0 1 20 0M5 11a10 10 0 0 1 14 0M8 14a5 5 0 0 1 8 0"/><circle cx="12" cy="18" r="1" fill="currentColor"/></svg>);
    case 'battery':
      return (<svg {...common}><rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/><rect x="4" y="9" width="12" height="6" rx="1" fill="currentColor" stroke="none"/></svg>);
    case 'signal':
      return (<svg {...common}><path d="M4 17h2M9 14h2M14 11h2M19 8h2" strokeWidth="3"/></svg>);
    case 'activity':
      return (<svg {...common}><path d="M3 12h4l2-6 4 12 2-6h6"/></svg>);
    case 'heart':
      return (<svg {...common}><path d="M12 20s-7-4.5-9.5-9.2C.8 7.5 3 4 6.5 4c2 0 3.5 1.2 5.5 3.2C14 5.2 15.5 4 17.5 4 21 4 23.2 7.5 21.5 10.8 19 15.5 12 20 12 20Z"/></svg>);
    case 'location':
      return (<svg {...common}><path d="M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z"/><circle cx="12" cy="10" r="2.5"/></svg>);
    case 'droplet':
      return (<svg {...common}><path d="M12 3s6 6 6 11a6 6 0 0 1-12 0c0-5 6-11 6-11Z"/></svg>);
    case 'scale':
      return (<svg {...common}><path d="M5 5h14l-2 14H7L5 5Z"/><path d="M9 9h6"/></svg>);
    case 'arrow-up':
      return (<svg {...common}><path d="M12 19V5M6 11l6-6 6 6"/></svg>);
    case 'arrow-down':
      return (<svg {...common}><path d="M12 5v14M6 13l6 6 6-6"/></svg>);
    case 'settings':
      return (<svg {...common}><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>);
    case 'camera':
      return (<svg {...common}><rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l2-2h4l2 2"/></svg>);
    case 'upload':
      return (<svg {...common}><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>);
    case 'flame':
      return (<svg {...common}><path d="M12 3s5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 1-5 0 0 2 1 2 3 0-3 2-5 2-8Z"/></svg>);
    default:
      return (<svg {...common}><circle cx="12" cy="12" r="8"/></svg>);
  }
};

window.Icon = Icon;
