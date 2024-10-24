import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';



const supabase = createClient(
  'https://rwpxmfuxmyjhsxjersgk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3cHhtZnV4bXlqaHN4amVyc2drIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk2ODc4MTUsImV4cCI6MjA0NTI2MzgxNX0.ZC-U9UWZdp8kK_r5dvJ1qaRkPxKKNJbUWQFp8vpmXm0'
);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <SessionContextProvider supabaseClient={supabase}>
    <App />
    </SessionContextProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
