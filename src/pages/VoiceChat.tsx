const USE_LOCAL_RELAY_SERVER_URL: string | undefined = void 0;

import { useEffect, useRef, useCallback, useState } from 'react';

import { RealtimeClient } from '@openai/realtime-api-beta';
import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
import { WavRenderer } from '../utils/wav_renderer';

import { X, Edit, Zap } from 'react-feather';
import { Button } from '../components/button/Button';

import './VoiceChat.scss';

type Props = {
  scrapedContent: string;
};

import { useSupabaseClient } from '@supabase/auth-helpers-react';

export const VoiceChat: React.FC<Props> = ({ scrapedContent }) => {
  const supabase = useSupabaseClient();
  const apiKey = USE_LOCAL_RELAY_SERVER_URL
    ? ''
    : localStorage.getItem('tmp::voice_api_key') ||
      prompt('OpenAI API Key') ||
      '';
  if (apiKey !== '') {
    localStorage.setItem('tmp::voice_api_key', apiKey);
  }

  const instructions = `SYSTEM SETTINGS:
------
INSTRUCTIONS:
- You will receive website data about a product.
- You are an artificial intelligence agent responsible to qualify leads and see if they are good fit for the product.
- Please make sure to respond with a helpful voice via audio
- Your response should be concise and to the point, keep it short, less than 200 characters max.
- You can ask the user questions
- Be open to exploration and conversation
- When mentioning dates and days of the week, ALWAYS verify the current date first
- Use Date.now() as reference point for all date calculations
- Double check all calendar dates and days of the week before confirming them
- If user mentions a day of week (like "Saturday"), calculate the exact date for the nearest occurrence of that day

CALENDAR CAPABILITIES:
- You can check user's calendar using the check_calendar function
- You can update existing calendar events using update_calendar_event function
- You can delete calendar events using delete_calendar_event function
- For deleting events, you need the event ID (you can get it from check_calendar)
- Always confirm with the user before deleting any events
- After deletion, inform the user that the event has been removed

EXAMPLES:
- For "delete my meeting tomorrow": first check_calendar to find the event, then use delete_calendar_event
- For "cancel next week's appointment": first check_calendar to find the event, then use delete_calendar_event
- Always confirm: "I found the meeting [meeting name]. Would you like me to delete it?"

------
PERSONALITY:
- Be upbeat and genuine
- Speak FAST as if excited
- Be precise with dates and times

------
WEBSITE DATA:

${scrapedContent}

TASK CAPABILITIES:
- You can create tasks using create_task_event function
- Tasks are different from regular calendar events:
  * They are all-day events
  * They have priority levels (high, medium, low)
  * They are marked as "free" time in calendar
  * They include a status indicator
- When creating tasks, always:
  * Ask for priority if not specified
  * Set appropriate due date
  * Add relevant description if provided
  * Use emoji indicators for better visibility

EXAMPLES OF TASK CREATION:
- "Create a task to review project proposal by Friday" 
- "Add a high priority task to submit report"
- "Remind me to call John next week"
- "Set a task for grocery shopping tomorrow"

TASK FORMATTING:
- High priority tasks: 🔴
- Medium priority tasks: 🟡
- Low priority tasks: 🟢
- Status indicator: ⬜ (not completed)
`;

  /**
   * Instantiate:
   * - WavRecorder (speech input)
   * - WavStreamPlayer (speech output)
   * - RealtimeClient (API client)
   */
  const wavRecorderRef = useRef<WavRecorder>(
    new WavRecorder({ sampleRate: 24000 })
  );
  const wavStreamPlayerRef = useRef<WavStreamPlayer>(
    new WavStreamPlayer({ sampleRate: 24000 })
  );
  const clientRef = useRef<RealtimeClient>(
    new RealtimeClient(
      USE_LOCAL_RELAY_SERVER_URL
        ? { url: USE_LOCAL_RELAY_SERVER_URL }
        : {
            apiKey: apiKey,
            dangerouslyAllowAPIKeyInBrowser: true,
          }
    )
  );

  /**
   * References for
   * - Rendering audio visualization (canvas)
   * - Autoscrolling event logs
   * - Timing delta for event log displays
   */
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  const serverCanvasRef = useRef<HTMLCanvasElement>(null);
  const startTimeRef = useRef<string>(new Date().toISOString());

  const [items, setItems] = useState<ItemType[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
  

  const resetAPIKey = useCallback(() => {
    const apiKey = prompt('OpenAI API Key');
    if (apiKey !== null) {
      localStorage.clear();
      localStorage.setItem('tmp::voice_api_key', apiKey);
      window.location.reload();
    }
  }, []);

  /**
   * Connect to conversation:
   * WavRecorder takes speech input, WavStreamPlayer output, client is API client
   */
  const connectConversation = useCallback(async () => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    const wavStreamPlayer = wavStreamPlayerRef.current;

    startTimeRef.current = new Date().toISOString();
    setIsConnected(true);
    setItems(client.conversation.getItems());

    // Connect to microphone
    await wavRecorder.begin();

    // Connect to audio output
    await wavStreamPlayer.connect();

    // Connect to realtime API
    await client.connect();
    client.sendUserMessageContent([
      {
        type: `input_text`,
        text: `Hello!`, // Can change this initial text
      },
    ]);

    if (client.getTurnDetectionType() === 'server_vad') {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  }, []);

  /**
   * Disconnect and reset conversation state
   */
  const disconnectConversation = useCallback(async () => {
    setIsConnected(false);
    setItems([]);

    const client = clientRef.current;
    client.disconnect();

    const wavRecorder = wavRecorderRef.current;
    await wavRecorder.end();

    const wavStreamPlayer = wavStreamPlayerRef.current;
    await wavStreamPlayer.interrupt();
  }, []);

  const deleteConversationItem = useCallback(async (id: string) => {
    const client = clientRef.current;
    client.deleteItem(id);
  }, []);

  /**
   * Switch between Manual <> VAD mode for communication
   */
  const changeTurnEndType = async (value: string) => {
    const client = clientRef.current;
    const wavRecorder = wavRecorderRef.current;
    if (value === 'none' && wavRecorder.getStatus() === 'recording') {
      await wavRecorder.pause();
    }
    client.updateSession({
      turn_detection: value === 'none' ? null : { type: 'server_vad' },
    });
    if (value === 'server_vad' && client.isConnected()) {
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    }
  };

  /**
   * Auto-scroll the conversation logs
   */
  useEffect(() => {
    const conversationEls = [].slice.call(
      document.body.querySelectorAll('[data-conversation-content]')
    );
    for (const el of conversationEls) {
      const conversationEl = el as HTMLDivElement;
      conversationEl.scrollTop = conversationEl.scrollHeight;
    }
  }, [items]);

  /**
   * Set up render loops for the visualization canvas
   */
  useEffect(() => {
    let isLoaded = true;

    changeTurnEndType('server_vad');

    const wavRecorder = wavRecorderRef.current;
    const clientCanvas = clientCanvasRef.current;
    let clientCtx: CanvasRenderingContext2D | null = null;

    const wavStreamPlayer = wavStreamPlayerRef.current;
    const serverCanvas = serverCanvasRef.current;
    let serverCtx: CanvasRenderingContext2D | null = null;

    const render = () => {
      if (isLoaded) {
        if (clientCanvas) {
          if (!clientCanvas.width || !clientCanvas.height) {
            clientCanvas.width = clientCanvas.offsetWidth;
            clientCanvas.height = clientCanvas.offsetHeight;
          }
          clientCtx = clientCtx || clientCanvas.getContext('2d');
          if (clientCtx) {
            clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
            const result = wavRecorder.recording
              ? wavRecorder.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              clientCanvas,
              clientCtx,
              result.values,
              '#0099ff',
              10,
              0,
              8
            );
          }
        }
        if (serverCanvas) {
          if (!serverCanvas.width || !serverCanvas.height) {
            serverCanvas.width = serverCanvas.offsetWidth;
            serverCanvas.height = serverCanvas.offsetHeight;
          }
          serverCtx = serverCtx || serverCanvas.getContext('2d');
          if (serverCtx) {
            serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
            const result = wavStreamPlayer.analyser
              ? wavStreamPlayer.getFrequencies('voice')
              : { values: new Float32Array([0]) };
            WavRenderer.drawBars(
              serverCanvas,
              serverCtx,
              result.values,
              '#fff700',
              10,
              0,
              8
            );
          }
        }
        window.requestAnimationFrame(render);
      }
    };
    render();

    return () => {
      isLoaded = false;
    };
  }, []);

  /**
   * Core RealtimeClient and audio capture setup
   * Set all of our instructions, tools, events and more
   */
  useEffect(() => {
    const wavStreamPlayer = wavStreamPlayerRef.current;
    const client = clientRef.current;

    client.updateSession({ instructions: instructions });
    client.updateSession({ input_audio_transcription: { model: 'whisper-1' } });
    client.updateSession({ voice: 'alloy' })

    client.addTool(
      {
        name: 'set_memory',
        description: 'Saves important data about the user into memory.',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description:
                'The key of the memory value. Always use lowercase and underscores, no other characters.',
            },
            value: {
              type: 'string',
              description: 'Value can be anything represented as a string',
            },
          },
          required: ['key', 'value'],
        },
      },
      async ({ key, value }: { [key: string]: any }) => {
        setMemoryKv((memoryKv) => {
          const newKv = { ...memoryKv };
          newKv[key] = value;
          return newKv;
        });
        return { ok: true };
      }
    );
    client.addTool(
      {
        name: 'create_calendar_event',
        description: 'Creates a new event in Google Calendar',
        parameters: {
          type: 'object',
          properties: {
            eventName: {
              type: 'string',
              description: 'Name/title of the calendar event'
            },
            eventDescription: {
              type: 'string',
              description: 'Description of the calendar event'
            },
            startTime: {
              type: 'string',
              description: 'Start time of event in ISO format (e.g. 2024-03-20T15:00:00)'
            },
            endTime: {
              type: 'string',
              description: 'End time of event in ISO format (e.g. 2024-03-20T16:00:00)'
            }
          },
          required: ['eventName', 'eventDescription', 'startTime', 'endTime']
        }
      },
      async ({ eventName, eventDescription, startTime, endTime }: { [key: string]: string }) => {
        const { data: { session } } = await supabase.auth.getSession();
        const providerToken = session?.provider_token;

        if (!providerToken) {
          return { ok: false, error: 'No authentication token found' };
        }

        const event = {
          'summary': eventName,
          'description': eventDescription,
          'start': {
            'dateTime': new Date(startTime).toISOString(),
            'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
          },
          'end': {
            'dateTime': new Date(endTime).toISOString(),
            'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
          }
        };

        try {
          const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${providerToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(event)
          });

          if (!response.ok) {
            throw new Error('Failed to create calendar event');
          }

          const data = await response.json();
          return { ok: true, eventId: data.id };
        } catch (error) {
          console.error('Error creating calendar event:', error);
          return { ok: false, error: 'Failed to create calendar event' };
        }
      }
    );
    client.addTool(
      {
        name: 'check_calendar',
        description: 'Check Google Calendar for events within a specified time range',
        parameters: {
          type: 'object',
          properties: {
            start_time: {
              type: 'string',
              description: 'Start time in ISO format (e.g., "2023-04-20T09:00:00-07:00")'
            },
            end_time: {
              type: 'string',
              description: 'End time in ISO format (e.g., "2023-04-20T17:00:00-07:00")'
            }
          },
          required: ['start_time', 'end_time']
        }
      },
      async ({ start_time, end_time }: { start_time: string; end_time: string }) => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const providerToken = session?.provider_token;

          if (!providerToken) {
            return { ok: false, error: 'No authentication token found' };
          }

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
            new URLSearchParams({
              timeMin: new Date(start_time).toISOString(),
              timeMax: new Date(end_time).toISOString(),
              singleEvents: 'true',
              orderBy: 'startTime'
            }),
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${providerToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!response.ok) {
            throw new Error('Failed to fetch calendar events');
          }

          const data = await response.json();
          const events = data.items || [];

          console.debug(`Found ${events.length} events in the calendar`);
          console.debug('Events:', events);

          return { 
            ok: true, 
            events: events.map((event: any) => ({
              id: event.id,
              summary: event.summary,
              start: event.start.dateTime || event.start.date,
              end: event.end.dateTime || event.end.date,
              description: event.description
            }))
          };

        } catch (error) {
          console.error('Error checking calendar:', error);
          return { ok: false, error: 'Failed to check calendar events' };
        }
      }
    );
    client.addTool(
      {
        name: 'update_calendar_event',
        description: 'Update an existing Google Calendar event',
        parameters: {
          type: 'object',
          properties: {
            event_id: {
              type: 'string',
              description: 'ID of the event to update'
            },
            summary: {
              type: 'string',
              description: 'New event title'
            },
            start_time: {
              type: 'string',
              description: 'New start time in ISO format'
            },
            end_time: {
              type: 'string',
              description: 'New end time in ISO format'
            },
            description: {
              type: 'string',
              description: 'New event description'
            }
          },
          required: ['event_id']
        }
      },
      async ({ 
        event_id, 
        summary, 
        start_time, 
        end_time, 
        description 
      }: { 
        event_id: string;
        summary?: string;
        start_time?: string;
        end_time?: string;
        description?: string;
      }) => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const providerToken = session?.provider_token;

          if (!providerToken) {
            return { ok: false, error: 'No authentication token found' };
          }

          // Сначала получаем текущее событие
          const getResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event_id}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${providerToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!getResponse.ok) {
            throw new Error('Failed to fetch event');
          }

          const currentEvent = await getResponse.json();

          // Обновляем только предоставленные поля
          const updatedEvent = {
            ...currentEvent,
            ...(summary && { summary }),
            ...(description && { description }),
            ...(start_time && {
              start: {
                dateTime: new Date(start_time).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
              }
            }),
            ...(end_time && {
              end: {
                dateTime: new Date(end_time).toISOString(),
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
              }
            })
          };

          // Отправляем обновленное событие
          const updateResponse = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event_id}`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${providerToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(updatedEvent)
            }
          );

          if (!updateResponse.ok) {
            throw new Error('Failed to update event');
          }

          const result = await updateResponse.json();
          console.debug('Event updated:', result);

          return { 
            ok: true, 
            updated_event: {
              id: result.id,
              summary: result.summary,
              start: result.start.dateTime || result.start.date,
              end: result.end.dateTime || result.end.date,
              description: result.description
            }
          };

        } catch (error) {
          console.error('Error updating calendar event:', error);
          return { ok: false, error: 'Failed to update calendar event' };
        }
      }
    );
    client.addTool(
      {
        name: 'delete_calendar_event',
        description: 'Delete a Google Calendar event',
        parameters: {
          type: 'object',
          properties: {
            event_id: {
              type: 'string',
              description: 'ID of the event to delete'
            }
          },
          required: ['event_id']
        }
      },
      async ({ event_id }: { event_id: string }) => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const providerToken = session?.provider_token;

          if (!providerToken) {
            return { ok: false, error: 'No authentication token found' };
          }

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event_id}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${providerToken}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!response.ok) {
            throw new Error('Failed to delete event');
          }

          console.debug('Event deleted:', event_id);

          return { 
            ok: true, 
            status: 'success',
            message: `Event with ID ${event_id} has been deleted`
          };

        } catch (error) {
          console.error('Error deleting calendar event:', error);
          return { ok: false, error: 'Failed to delete calendar event' };
        }
      }
    );
    client.addTool(
      {
        name: 'create_task_event',
        description: 'Creates a new task event in Google Calendar',
        parameters: {
          type: 'object',
          properties: {
            task_name: {
              type: 'string',
              description: 'Name/title of the task'
            },
            due_date: {
              type: 'string',
              description: 'Due date for the task in ISO format (e.g. 2024-03-20)'
            },
            description: {
              type: 'string',
              description: 'Description or details of the task'
            },
            priority: {
              type: 'string',
              description: 'Priority level (high, medium, low)',
              enum: ['high', 'medium', 'low']
            }
          },
          required: ['task_name', 'due_date']
        }
      },
      async ({ 
        task_name, 
        due_date, 
        description = '', 
        priority = 'medium' 
      }: { 
        task_name: string;
        due_date: string;
        description?: string;
        priority?: 'high' | 'medium' | 'low';
      }) => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const providerToken = session?.provider_token;

          if (!providerToken) {
            return { ok: false, error: 'No authentication token found' };
          }

          // Создаем emoji индикатор приоритета
          const priorityEmoji = {
            high: '🔴',
            medium: '🟡',
            low: '🟢'
          }[priority];

          const event = {
            'summary': `${priorityEmoji} Task: ${task_name}`,
            'description': `${description}\n\nPriority: ${priority}\nStatus: ⬜ Not completed`,
            'start': {
              'date': due_date.split('T')[0], // Берем только дату без времени
              'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
            },
            'end': {
              'date': due_date.split('T')[0],
              'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
            },
            'transparency': 'transparent', // Показывает как "свободен" в календаре
            'extendedProperties': {
              'private': {
                'type': 'task',
                'priority': priority,
                'status': 'not_completed'
              }
            }
          };

          const response = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${providerToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(event)
            }
          );

          if (!response.ok) {
            throw new Error('Failed to create task event');
          }

          const data = await response.json();
          console.debug('Task created:', data);

          return { 
            ok: true, 
            task: {
              id: data.id,
              summary: data.summary,
              due_date: data.start.date,
              description: data.description,
              priority: priority
            }
          };

        } catch (error) {
          console.error('Error creating task event:', error);
          return { ok: false, error: 'Failed to create task event' };
        }
      }
    );

    client.on('error', (event: any) => console.error(event));
    client.on('conversation.interrupted', async () => {
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
    });
    client.on('conversation.updated', async ({ item, delta }: any) => {
      const items = client.conversation.getItems();
      if (delta?.audio) {
        wavStreamPlayer.add16BitPCM(delta.audio, item.id);
      }
      if (item.status === 'completed' && item.formatted.audio?.length) {
        const wavFile = await WavRecorder.decode(
          item.formatted.audio,
          24000,
          24000
        );
        item.formatted.file = wavFile;
      }
      setItems(items);
    });

    setItems(client.conversation.getItems());

    return () => {
      // cleanup; resets to defaults
      client.reset();
    };
  }, []);

  /**
   * Render the application
   */
  return (
    <div data-component="VoiceChat">
      <div className="content-top">
        <div className="content-title">
          <span>AI Voice Agent</span>
        </div>
        <div className="content-api-key">
          {!USE_LOCAL_RELAY_SERVER_URL && (
            <Button
              icon={Edit}
              iconPosition="end"
              buttonStyle="flush"
              label={`api key: ${apiKey.slice(0, 3)}...`}
              onClick={() => resetAPIKey()}
            />
          )}
        </div>
      </div>
      <div className="content-main">
        <div className="content-logs">
          <div className="content-block events">
            <div className="visualization">
              <div className="visualization-entry client">
                <canvas ref={clientCanvasRef} />
              </div>
              <div className="visualization-entry server">
                <canvas ref={serverCanvasRef} />
              </div>
            </div>
          </div>
          {items.length > 0 && (
            <div className="content-block conversation">
              <div className="content-block-body" data-conversation-content>
                {items.map((conversationItem, i) => {
                  return (
                    <div
                      className="conversation-item"
                      key={conversationItem.id}
                    >
                      <div className={`speaker ${conversationItem.role || ''}`}>
                        <div>
                          {(
                            conversationItem.role || conversationItem.type
                          ).replaceAll('_', ' ')}
                        </div>
                        <div
                          className="close"
                          onClick={() =>
                            deleteConversationItem(conversationItem.id)
                          }
                        >
                          <X />
                        </div>
                      </div>
                      <div className={`speaker-content`}>
                        {!conversationItem.formatted.tool &&
                          conversationItem.role === 'user' && (
                            <div>
                              {conversationItem.formatted.transcript ||
                                (conversationItem.formatted.audio?.length
                                  ? '(awaiting transcript)'
                                  : conversationItem.formatted.text ||
                                    '(item sent)')}
                            </div>
                          )}
                        {!conversationItem.formatted.tool &&
                          conversationItem.role === 'assistant' && (
                            <div>
                              {conversationItem.formatted.transcript ||
                                conversationItem.formatted.text ||
                                '(truncated)'}
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="content-actions">
            <Button
              label={isConnected ? 'Disconnect' : 'Connect'}
              iconPosition={isConnected ? 'end' : 'start'}
              icon={isConnected ? X : Zap}
              buttonStyle={isConnected ? 'regular' : 'action'}
              onClick={
                isConnected ? disconnectConversation : connectConversation
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
