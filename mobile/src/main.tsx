import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '../../app/globals.css';
import './mobile.css';

const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
const applySystemTheme = ({ matches }: Pick<MediaQueryList, 'matches'>) => {
  document.documentElement.classList.toggle('dark', matches);
};
applySystemTheme(systemTheme);
systemTheme.addEventListener('change', applySystemTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
