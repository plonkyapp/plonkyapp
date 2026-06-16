// icons.jsx — minimal line icons (simple shapes only)
const Ic = {};

function mk(name, paths, vb = 24, opts = {}) {
  Ic[name] = function ({ size = 24, color = 'currentColor', sw = 2, fill = 'none', style = {} }) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${vb} ${vb}`} fill={fill === 'currentColor' ? color : fill}
           stroke={opts.solid ? 'none' : color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
        {paths}
      </svg>
    );
  };
}

mk('chevR', <path d="M9 5l7 7-7 7" />);
mk('chevL', <path d="M15 5l-7 7 7 7" />);
mk('chevDown', <path d="M5 9l7 7 7-7" />);
mk('arrowR', <g><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></g>);
mk('plus', <g><path d="M12 5v14" /><path d="M5 12h14" /></g>);
mk('minus', <path d="M5 12h14" />);
mk('check', <path d="M5 12.5l4.5 4.5L19 7" />);
mk('x', <g><path d="M6 6l12 12" /><path d="M18 6L6 18" /></g>);
mk('trash', <g><path d="M4 7h16" /><path d="M9 7V5.2a1.5 1.5 0 011.5-1.5h3a1.5 1.5 0 011.5 1.5V7" /><path d="M6.5 7l.8 11a2 2 0 002 1.8h5.4a2 2 0 002-1.8l.8-11" /><path d="M10 11v5M14 11v5" /></g>);
mk('pencil', <g><path d="M4 20h4L18.5 9.5a2 2 0 000-2.8l-1.2-1.2a2 2 0 00-2.8 0L4 16v4z" /><path d="M13.5 6.5l4 4" /></g>);
mk('user', <g><circle cx="12" cy="8" r="3.6" /><path d="M5.5 19.5c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" /></g>);
mk('users', <g><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.8-4.8 5.5-4.8s4.9 1.6 5.5 4.8" /><path d="M16 5.2a3 3 0 010 5.8" /><path d="M17.5 14.4c2.2.5 3.6 1.9 4 4.6" /></g>);
mk('mic', <g><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0013 0" /><path d="M12 18v3" /></g>);
mk('flag', <g><path d="M7 21V4" /><path d="M7 4.5h9.5l-2.2 3.3 2.2 3.2H7" /></g>);
mk('camera', <g><path d="M3 8.8A1.8 1.8 0 014.8 7H7l1.4-2h7.2L17 7h2.2A1.8 1.8 0 0121 8.8v8.4A1.8 1.8 0 0119.2 19H4.8A1.8 1.8 0 013 17.2z" /><circle cx="12" cy="12.8" r="3.2" /></g>);
mk('target', <g><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /></g>);
mk('trophy', <g><path d="M7 4h10v4a5 5 0 01-10 0V4z" /><path d="M7 6H4.5A2.5 2.5 0 007 10.5" /><path d="M17 6h2.5A2.5 2.5 0 0117 10.5" /><path d="M12 13v3" /><path d="M8.5 20h7" /><path d="M10 16.5h4l.5 3.5h-5z" /></g>);
mk('sparkle', <g><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></g>);
mk('link', <g><path d="M9.5 14.5l5-5" /><path d="M8 11l-2 2a3.2 3.2 0 004.5 4.5l2-2" /><path d="M16 13l2-2A3.2 3.2 0 0013.5 6.5l-2 2" /></g>);
mk('home', <g><path d="M4 11l8-6 8 6" /><path d="M6 10v9h12v-9" /></g>);
mk('clock', <g><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 2" /></g>);
mk('list', <g><path d="M8 7h11" /><path d="M8 12h11" /><path d="M8 17h11" /><circle cx="4.5" cy="7" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="17" r="1.1" fill="currentColor" stroke="none" /></g>);
mk('shuffle', <g><path d="M4 7h3.5l9 10H20" /><path d="M17 4l3 3-3 3" /><path d="M4 17h3.5l2.2-2.5" /><path d="M14.3 9.5L16.5 7" /><path d="M17 14l3 3-3 3" /></g>);
mk('scan', <g><path d="M4 8V5.5A1.5 1.5 0 015.5 4H8" /><path d="M16 4h2.5A1.5 1.5 0 0120 5.5V8" /><path d="M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16" /><path d="M8 20H5.5A1.5 1.5 0 014 18.5V16" /><path d="M4 12h16" /></g>);
mk('pin', <g><path d="M12 21s6-5.3 6-10a6 6 0 10-12 0c0 4.7 6 10 6 10z" /><circle cx="12" cy="11" r="2.4" /></g>);
mk('help', <g><circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.6a2.3 2.3 0 014.4.8c0 1.5-2.1 1.9-2.1 3.3" /><path d="M12 17.1v.01" /></g>);

window.Ic = Ic;
