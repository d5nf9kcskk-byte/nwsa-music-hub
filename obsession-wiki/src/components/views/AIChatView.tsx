import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, KeyRound, MessageSquare } from 'lucide-react';

const STORAGE_KEY = 'obsession_ai_key';
const MODEL = 'claude-haiku-4-5-20251001';
const API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are an expert rulebook assistant for Obsession, the Victorian board game by Dan Hallagan (Kayenta Games). Answer questions thoroughly and accurately based on these rules:

SERVANTS (Base game: Butler, Valet, Lady's Maid, Housekeeper, Footman, Underbutler. Upstairs/Downstairs adds: Cook, Hall Boy, Head Housemaid, Useful Man):

SUBSTITUTION RULES:
- Underbutler can substitute for Butler or Valet
- Useful Man (U/D expansion) can substitute for any male servant
- Head Housemaid can substitute for Lady's Maid or Housekeeper
- Hall Boy can substitute for Footman

HIRING SERVANTS:
- On your turn, you may take the "Hire a Servant" action
- Pay the cost from the market (typically £100-£200)
- Servants start in the Servant Hall (unemployed)
- During an activity, servants are assigned from the Servant Hall to the activity tile
- The Underbutler is a special servant that can stand in for Butler or Valet

IMPROVEMENT TILES:
- Each tile specifies required servant types, guest count/gender, and provides favors
- Level 1 (front): base favors. Level 2 (back, after upgrading): enhanced favors
- To host an activity on a tile, you need all required servants available
- Starting tiles: Private Study (no servant), Butler's Room, Main Gazebo, Front Parlour, Bowling Green

FAMILIES:
- Asquith: Has Dowager Countess as 5th family member
- Cavendish: Starts at reputation level 1.4 (bonus reputation points)
- Ponsonby: Starts with £300 extra
- York: Starts with an extra Footman
- Wessex (expansion): Larger estate, choose Morning/Retiring or Breakfast/Tennis
- Howard (U/D expansion): Servant-focused, starts with extra Cook

TURN STRUCTURE:
Each player turn: 1) Choose an action: Host Activity, Hire Servant, Acquire Tile, Refresh Servants, Pass. 2) Take the action. 3) Play passes left.

HOST ACTIVITY: Choose a tile in your estate, ensure all required servants are available (in Servant Hall), assign them, invite guest(s) matching type requirements, gain the favors listed.

SPECIAL ROUNDS:
- Village Fair (round 3, 9 in standard / 4, 9, 16 extended): +£300 and +2 Rep for Private Study holders
- Courtship (round 4, 8, 12, 16 / 5, 10, 15, 20): VP scored by theme; winner gets Fairchild card
- Builder's Holiday (round 11 / 13): Buy unlimited tiles this round
- National Holiday (round 14 / 11): No reputation restrictions this round

GENTRY CARDS:
- Starter cards: free to invite, no reputation requirement
- Casual cards: require moderate reputation
- Prestige cards: require higher reputation
- Family cards: special family-specific guests
- Fairchild cards: won through Courtship

SCORING: Victory Points from tiles (face value), gentry cards held (VP printed), objective cards, prestige track position, money (£100 = 1 VP).

PASS ACTION: Take £50 and gain 1 reputation. Useful when you cannot afford other actions.

Answer questions based on this ruleset. Be specific about servant types, costs, and requirements. If something depends on expansion ownership, say so. For edge cases not explicitly covered, reason from the spirit of the rules.`;

const STARTER_QUESTIONS = [
  'How do I hire the Underbutler?',
  'What servants does the Kitchen require?',
  'Explain courtship scoring',
  'Can servants substitute for each other?',
];

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AIChatView() {
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [savedKey, setSavedKey] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const saveKey = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    localStorage.setItem(STORAGE_KEY, trimmed);
    setSavedKey(trimmed);
    setShowKeyInput(false);
    setError(null);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || !savedKey) return;
    setError(null);

    const userMsg: Message = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': savedKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Invalid API key. Please check your key and try again.');
        } else {
          const data = await response.json().catch(() => ({}));
          setError(`Error ${response.status}: ${(data as { error?: { message?: string } }).error?.message ?? response.statusText}`);
        }
        setMessages(prev => prev.slice(0, -1));
        return;
      }

      const data = await response.json() as {
        content: Array<{ type: string; text: string }>;
      };
      const reply = data.content.find(c => c.type === 'text')?.text ?? '';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  // — Setup / key entry screen —
  if (!savedKey || showKeyInput) {
    return (
      <div className="chat-view">
        <div className="section-header">
          <h1>Ask the Rulebook</h1>
          <p>Get AI-powered answers to your Obsession questions</p>
        </div>
        <div className="api-key-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem' }}>
            <KeyRound size={18} color="var(--gold)" />
            <h3>Anthropic API Key Required</h3>
          </div>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '0.5rem' }}>
            This feature calls the Claude AI API directly from your browser. You'll need a free Anthropic API key.
          </p>
          <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Get your key at{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--gold)' }}>console.anthropic.com</a>.
          </p>
          <input
            type="password"
            className="api-key-input"
            placeholder="sk-ant-..."
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveKey()}
            autoFocus
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
            Your key is stored locally in your browser only — never sent anywhere except api.anthropic.com.
          </p>
          <button
            className="btn-primary"
            onClick={saveKey}
            disabled={!apiKey.trim()}
            style={{
              background: apiKey.trim() ? 'var(--gold)' : 'var(--surface2)',
              color: apiKey.trim() ? '#1a0f00' : 'var(--text-muted)',
              border: 'none',
              borderRadius: '8px',
              padding: '0.6rem 1.5rem',
              cursor: apiKey.trim() ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              fontSize: '0.9rem',
              width: '100%',
            }}
          >
            Save Key &amp; Start Chatting
          </button>
          {showKeyInput && (
            <button
              onClick={() => setShowKeyInput(false)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: '0.8rem', marginTop: '0.75rem', width: '100%',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 1rem 0.5rem', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={16} color="var(--gold)" />
          <span style={{ fontFamily: "'Playfair Display', serif", color: 'var(--gold-l)', fontWeight: 600, fontSize: '1rem' }}>
            Ask the Rulebook
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
              borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: '4px', fontSize: '0.75rem',
            }}
          >
            <Trash2 size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🎩</div>
            <p style={{ fontFamily: "'Playfair Display', serif", color: 'var(--text-dim)', marginBottom: '0.5rem', fontSize: '1rem' }}>
              Ask me anything about Obsession
            </p>
            <p style={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
              Servants, tiles, families, scoring, special rounds — I know the rulebook.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            {msg.content.split('\n').map((line, j) => (
              <span key={j}>
                {line}
                {j < msg.content.split('\n').length - 1 && <br />}
              </span>
            ))}
          </div>
        ))}

        {loading && (
          <div className="chat-msg ai thinking">
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="chat-error">{error}</div>
      )}

      {/* Starter suggestions (only when no messages) */}
      {messages.length === 0 && (
        <div className="chat-suggestions">
          {STARTER_QUESTIONS.map(q => (
            <button
              key={q}
              className="chat-suggestion"
              onClick={() => sendMessage(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="chat-input-row">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Ask about rules, servants, tiles..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          style={{ minHeight: '38px', maxHeight: '120px', overflowY: 'auto' }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
          style={{
            background: input.trim() && !loading ? 'var(--gold)' : 'var(--surface2)',
            color: input.trim() && !loading ? '#1a0f00' : 'var(--text-muted)',
            border: 'none', borderRadius: '8px', padding: '0 14px',
            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, height: '38px', transition: 'all 0.2s',
          }}
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '0.5rem 1rem', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={() => setShowKeyInput(true)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            cursor: 'pointer', fontSize: '0.72rem',
          }}
        >
          Change API key
        </button>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', margin: '0 8px' }}>·</span>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
          Key stored locally only
        </span>
      </div>
    </div>
  );
}
