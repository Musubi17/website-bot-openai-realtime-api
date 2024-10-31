import { useState, useEffect } from 'react';
import { VoiceChat } from './pages/VoiceChat';
import { ScrapeForm } from './pages/ScrapeForm';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';

import DateTimePicker from 'react-datetime-picker';
import 'react-datetime-picker/dist/DateTimePicker.css';
import 'react-calendar/dist/Calendar.css';
import 'react-clock/dist/Clock.css';

import './App.scss';

function App() {
  const session = useSession(); // tokens, when session exist we have a user
  const supabase = useSupabaseClient(); // to talk with supabase
  const [scrapedContent, setScrapedContent] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [eventName, setEventName] = useState("");
  const [eventDescription, setEventDescription] = useState("");

  const [start, setStart] = useState<Date>(new Date());
  const [end, setEnd] = useState<Date>(new Date());


  async function googleSignIn() {
    if (!supabase || !supabase.auth) {
      console.log('Supabase client is not initialized');
      return;
    }
    const {error} = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar',
      }
    });

    if (error) {
      alert('Error signing in to Google provider with Supabase');
      console.log(error);
    }
  }

  async function signOut() {
    if (supabase && supabase.auth){
      await supabase.auth.signOut();
      setScrapedContent('');
      setUserEmail(null);
      localStorage.clear();
      
    }
  }

  const handleScrapedContent = (content: string) => {
    setScrapedContent(content);
  };

  useEffect(() => {
    if(session?.user?.email){
      setUserEmail(session.user.email);
    } else {
      setUserEmail(null);
      setScrapedContent('');
    }
  }, [session]);


  return ( 
    <div className="app-container">
      <div>
        {session ? 
        <>
          {scrapedContent ? (            
            <VoiceChat scrapedContent={scrapedContent} />
          ) : (
          <>
            <div className="content">
              <ScrapeForm onScrapedContent={handleScrapedContent} userEmail={userEmail}/>
            </div>
            
            <div style={{ height: 40}}></div>
            <div className="sign-out-button-container">
              <button onClick={signOut} className="sign-out-button">Sign Out</button>
            </div>
          </>
          )}
        </>
        :
        <>
          <button onClick={() => googleSignIn()} type="submit" className="submit-button">
            Sign in with Google
          </button>
        </>
        }
      </div>
    </div>
  );
}

export default App;
