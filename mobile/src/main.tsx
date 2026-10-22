import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import '../../app/globals.css';
import './mobile.css';

const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

function resolveDarkTheme(systemPrefersDark: boolean): boolean {
  const storedTheme = window.localStorage.getItem('theme');
  if (storedTheme === 'dark') return true;
  if (storedTheme === 'light') return false;
  return systemPrefersDark;
}

const applyTheme = ({ matches }: Pick<MediaQueryList, 'matches'>) => {
  const dark = resolveDarkTheme(matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.classList.toggle('light', !dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
};

applyTheme(systemTheme);
systemTheme.addEventListener('change', applyTheme);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
