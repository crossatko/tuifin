// Theme — all colors used across the app
// Based on Catppuccin Mocha palette

export const theme = {
  // Brand
  accent: "#a78bfa",

  // Backgrounds
  bg: {
    base: "#1e1e2e",
    surface: "#313244",
    overlay: "#45475a",
  },

  // Text
  text: {
    primary: "#cdd6f4",
    muted: "#6c7086",
    bright: "#ffffff",
  },

  // Status
  status: {
    success: "#a6e3a1",
    error: "#f38ba8",
    warning: "#fab387",
    info: "#89b4fa",
  },

  // Input fields
  input: {
    bg: "#1e1e2e",
    text: "#cdd6f4",
    cursor: "#a78bfa",
    focusedBg: "#313244",
  },

  // Select / list
  select: {
    selectedBg: "#313244",
    selectedText: "#cdd6f4",
    focusedBg: "#45475a",
  },

  // Borders
  border: {
    normal: "#a78bfa",
    muted: "#45475a",
  },
} as const

export type Theme = typeof theme
