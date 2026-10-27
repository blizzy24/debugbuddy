export const config = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  apiUrl: (import.meta.env.VITE_API_URL ?? 'http://localhost:8787').replace(/\/+$/, ''),
  widgetUrl: import.meta.env.VITE_WIDGET_URL ?? 'http://localhost:5174/dist/widget.js',
};

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
