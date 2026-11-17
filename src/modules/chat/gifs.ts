/** Bandeja de GIFs predefinidos del chat (animaciones propias en /public/chat/gifs). Un mensaje solo puede llevar uno de estos. */
export type ChatGif = { key: string; label: string; src: string };

export const CHAT_GIFS: ChatGif[] = [
  { key: "fuego", label: "Fuego", src: "/chat/gifs/fuego.gif" },
  { key: "baile", label: "A bailar", src: "/chat/gifs/baile.gif" },
  { key: "aplauso", label: "Aplausos", src: "/chat/gifs/aplauso.gif" },
  { key: "corazon", label: "Amor", src: "/chat/gifs/corazon.gif" },
  { key: "onair", label: "En el aire", src: "/chat/gifs/onair.gif" },
  { key: "gracias", label: "Gracias", src: "/chat/gifs/gracias.gif" },
  { key: "wow", label: "Wow", src: "/chat/gifs/wow.gif" },
  { key: "vinilo", label: "Vinilo", src: "/chat/gifs/vinilo.gif" },
];

export const gifByKey = (key: string | null | undefined): ChatGif | undefined => CHAT_GIFS.find((g) => g.key === key);
