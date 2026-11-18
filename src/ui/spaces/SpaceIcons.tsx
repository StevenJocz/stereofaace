import type { ReactNode } from "react";

/** Iconos de línea (24×24) del Space. Decorativos: el texto accesible va en el enlace o botón que los contiene. */
const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false };
const make = (children: ReactNode) => <svg {...base}>{children}</svg>;

export const Icon = {
  home: () => make(<path d="M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20" />),
  music: () => make(<><path d="M9 18V5l10-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>),
  image: () => make(<><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17.5 5-4.5 3.5 3 3-2.5 4.5 4" /></>),
  heart: () => make(<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />),
  link: () => make(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></>),
  pin: () => make(<><path d="M12 21s6.5-5.6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.4 6.5 11 6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></>),
  clock: () => make(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  share: () => make(<><circle cx="6" cy="12" r="2.4" /><circle cx="17.5" cy="6" r="2.4" /><circle cx="17.5" cy="18" r="2.4" /><path d="m8.1 10.8 7.3-3.6M8.1 13.2l7.3 3.6" /></>),
  more: () => make(<><circle cx="5.5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18.5" cy="12" r="1.2" fill="currentColor" /></>),
  pencil: () => make(<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />),
  verified: () => (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="10.5" fill="currentColor" />
      <path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="var(--sp-bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  note: () => make(<><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>),
  instagram: () => make(<><rect x="4" y="4" width="16" height="16" rx="4.5" /><circle cx="12" cy="12" r="3.6" /><circle cx="16.8" cy="7.3" r="0.9" fill="currentColor" stroke="none" /></>),
  x: () => make(<path d="M5 4.5 19 19.5M19 4.5l-5.8 6.2M10.8 13.3 5 19.5" />),
  spotify: () => make(<><circle cx="12" cy="12" r="8.5" /><path d="M7.5 9.6c3-.9 6.3-.6 9 .9M8 12.5c2.5-.7 5.1-.4 7.4.9M8.6 15.2c2-.5 3.9-.3 5.7.7" /></>),
  youtube: () => make(<><rect x="3" y="6" width="18" height="12" rx="4" /><path d="m10.3 9.5 4.4 2.5-4.4 2.5Z" fill="currentColor" /></>),
  soundcloud: () => make(<><path d="M3.5 14.5v2M6 13v3.5M8.5 11.5v5M11 10v6.5" /><path d="M11 16.5h7a3 3 0 0 0 .4-6A5 5 0 0 0 11 10.2" /></>),
  tiktok: () => make(<path d="M14 4v10.2a3.2 3.2 0 1 1-3.2-3.2M14 4c.4 2.4 1.9 3.9 4.5 4.1" />),
  facebook: () => make(<path d="M14 20v-7h2.6l.5-3H14V8.4c0-.9.4-1.4 1.5-1.4h1.7V4.3C16.700 4.200 15.900 4 15.100 4 12.700 4 11 5.400 11 8v2H8.500v3H11v7" />),
  bandcamp: () => make(<path d="M3.5 17.500 9 6.500h11.500L15 17.500Z" />),
  globe: () => make(<><circle cx="12" cy="12" r="8.500" /><path d="M3.500 12h17M12 3.500c2.500 2.500 3.500 5.300 3.500 8.500s-1 6-3.500 8.500C9.500 18 8.500 15.200 8.500 12s1-6 3.500-8.500Z" /></>),
};

export const linkIcon = (key: string): ReactNode => (key in Icon ? Icon[key as keyof typeof Icon]() : Icon.globe());
