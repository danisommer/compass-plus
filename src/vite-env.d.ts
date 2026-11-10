/// <reference types="vite/client" />

// Propriedade global usada pelo grafo (ajuste de zoom/centralização).
interface Window {
  __grafoFit?: () => void;
}
