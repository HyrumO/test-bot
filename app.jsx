import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Send, User, Bot, FileText, CheckCircle, 
  Target, RotateCcw, BrainCircuit, Zap, Star, 
  ChevronDown, ChevronUp, AlertCircle, Info, Lightbulb,
  Book, Trash2
} from 'lucide-react';

export default function App() {  
  const [messages, setMessages] = useState([
    { role: 'model', text: "Hello Teacher. I am ready to learn. I have no pre-existing knowledge. Upload your materials and dictionary to start teaching me!" }
  ]);
  const [hiddenMemory, setHiddenMemory] = useState([]); 
  const [dictionary, setDictionary] = useState({});
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('idle'); 
  const [uploadedFile, setUploadedFile] = useState(null);
  
  const [extractedData, setExtractedData] = useState({
    topics: [],
    masteryChallenges: [], 
    actualHomework: [],
    answerKey: [] 
  });

  const [testResults, setTestResults] = useState(null); 
  const [gradingReport, setGradingReport] = useState(null);
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [expandedChallenge, setExpandedChallenge] = useState(null);
  const [isDeploying, setIsDeploying] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const dictInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const parseJsonFromResponse = (text) => {
    try {
      let cleaned = text.trim();
      
      // Remove markdown code blocks if present
      if (cleaned.includes("```")) {
        const parts = cleaned.split("```");
        for (let part of parts) {
          const inner = part.trim();
          if (inner.startsWith('{') || inner.startsWith('[')) {
            cleaned = inner.replace(/^(json|JSON)/, '').trim();
            break;
          }
        }
      }
      
      // Fix for the "Bad escaped character" error:
      // We need to double-escape backslashes, but keep valid JSON escapes like \" or \n.
      // This logic specifically targets backslashes used in LaTeX (e.g., \beta, \Delta) 
      // which the LLM often fails to double-escape in its raw output.
      const sanitized = cleaned
        .replace(/\\/g, "\\\\")          // First, escape every single backslash
        .replace(/\\\\"/g, "\\\"")       // Restore valid escaped quotes
        .replace(/\\\\n/g, "\\n")        // Restore valid newlines
        .replace(/\\\\r/g, "\\r")        // Restore valid carriage returns
        .replace(/\\\\t/g, "\\t")        // Restore valid tabs
        .replace(/\\\\f/g, "\\f")        // Restore valid form feeds
        .replace(/\\\\b/g, "\\b");       // Restore valid backspaces (rarely used by AI but standard)
      
      return JSON.parse(sanitized);
    } catch (e) {
      console.error("JSON Parse Error:", e, "Original text:", text);
      return null;
    }
  };

  const fetchWithRetry = async (url, options, maxRetries = 5) => {
    const delays = [1000, 2000, 4000, 8000];
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await fetch(url, options);
        if (res.ok) return res;
        if (res.status !== 429 && res.status < 500) break; 
      } catch (e) {}
      await new Promise(r => setTimeout(r, delays[i] || 10000));
    }
    throw new Error("Failed after retries");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploadedFile(file);
    setUploadStatus('uploading');
    setTestResults(null);
    setGradingReport(null);

    try {
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(file);
      });

      const apiKey = ""; // API Key placeholder
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const prompt = `Analyze this homework document. 
      1. Identify CORE Knowledge Topics. Combine related sub-topics into broad categories.
      2. Generate 1 high-difficulty Mastery Challenge per topic.
      3. Extract ACTUAL homework questions exactly.
      4. CREATE THE RUBRIC-BASED ANSWER KEY:
         - BREAK THE ANSWER DOWN into essential "point-earning" bullets. 
      
      CRITICAL JSON SAFETY:
      - If you use math symbols or LaTeX (e.g. \\beta, \\delta, $), you MUST use DOUBLE BACKSLASHES (\\\\beta) so the JSON is valid.
      - Never use single backslashes in strings.
      - Ensure the output is a single, valid JSON object.
      
      Return strictly as JSON: 
      {
        "topics": ["string"], 
        "masteryChallenges": [{"topic": "string", "question": "string"}], 
        "actualHomework": ["string"], 
        "answerKey": [{"question": "string", "points": ["bullet 1", "bullet 2"]}]
      }`;

      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: file.type, data: base64 } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const result = await response.json();
      const rawText = result.candidates[0].content.parts[0].text;
      const parsed = parseJsonFromResponse(rawText);
      if (parsed) {
        setExtractedData(parsed);
        setUploadStatus('done');
      } else {
        setUploadStatus('error');
      }
    } catch (error) {
      console.error(error);
      setUploadStatus('error');
    }
  };

  const handleDictUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        setDictionary(json);
      } catch (err) {
        alert("Invalid JSON dictionary file.");
      }
    };
    reader.readAsText(file);
  };

  const handleDeployAndGrade = async () => {
    if (extractedData.actualHomework.length === 0) return;
    
    setIsDeploying(true);
    setGradingReport(null);
    
    const testPrompt = `FINAL EXAM. 
    
    TEACHING CONTEXT (THIS IS YOUR ONLY KNOWLEDGE BASE):
    ${hiddenMemory.length > 0 ? hiddenMemory.join('\n---\n') : "NONE."}

    DICTIONARY ACCESS:
    ${JSON.stringify(dictionary)}

    QUESTIONS:
    ${extractedData.actualHomework.map((q, i) => `${i+1}. ${q}`).join('\n')}

    Return as a JSON array: [{"question": "string", "thoughtProcess": "string", "status": "SOLVED | GUESS | UNKNOWN", "answer": "string"}]`;

    const apiKey = "";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const testSystemInstruction = `You are an AI student taking an exam. 
    1. BLANK SLATE: You have ZERO pre-existing knowledge.
    2. DICTIONARY USAGE: The dictionary is your knowledge source. Use its terms naturally to answer the questions. Do not include parenthetical definitions.
    3. NO EXTERNAL JARGON: Do not use words outside the training context or dictionary.`;

    try {
      const studentResponse = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: testPrompt }] }],
          systemInstruction: { parts: [{ text: testSystemInstruction }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const studentData = await studentResponse.json();
      const rawStudentText = studentData.candidates[0].content.parts[0].text;
      const studentResults = parseJsonFromResponse(rawStudentText);
      setTestResults(studentResults);

      const gradingPrompt = `Grade this exam based on a point system.
      RUBRIC: ${JSON.stringify(extractedData.answerKey)}
      STUDENT SUBMISSION: ${JSON.stringify(studentResults)}
      Return strictly as JSON: { "overallScore": number, "feedback": "string", "breakdown": [...] }`;

      const profResponse = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: gradingPrompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const profData = await profResponse.json();
      const rawProfText = profData.candidates[0].content.parts[0].text;
      setGradingReport(parseJsonFromResponse(rawProfText));

    } catch (e) {
      console.error(e);
    } finally {
      setIsDeploying(false);
    }
  };

  const callGeminiAPI = async (userText, chatHistory) => {
    const apiKey = "";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const systemInstruction = `You are a blank-slate AI student. You know NOTHING except what the Teacher tells you.
    DICTIONARY ACCESS: ${JSON.stringify(dictionary)}
    
    RULES:
    1. If the Teacher uses a word you don't know, check the dictionary.
    2. Use terms from the dictionary naturally in your response. DO NOT provide parenthetical definitions or explain the terms unless the teacher asks you to.
    3. Respond in JSON: { "internalNotes": "string", "shortReply": "string", "question": "string" }`;

    const contents = chatHistory.filter(m => !m.isSecondary).map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: userText }] });

    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return parseJsonFromResponse(rawText);
    } catch (e) {
      return { shortReply: "Connection error." };
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);
    const structuredResponse = await callGeminiAPI(userMessage, messages);
    if (structuredResponse && structuredResponse.internalNotes) {
        setHiddenMemory(prev => [...prev, structuredResponse.internalNotes]);
    }
    const reply = structuredResponse?.shortReply || "I understand.";
    setMessages(prev => [...prev, { role: 'model', text: reply }]);
    if (structuredResponse?.question?.trim()) {
      setTimeout(() => setMessages(prev => [...prev, { role: 'model', text: structuredResponse.question, isSecondary: true }]), 600);
    }
    setIsLoading(false);
  };

  const resetAll = () => {
    setMessages([{ role: 'model', text: "Hello Teacher. Memory wiped. Ready to start fresh." }]);
    setHiddenMemory([]);
    setDictionary({});
    setUploadStatus('idle');
    setUploadedFile(null);
    setExtractedData({ topics: [], masteryChallenges: [], actualHomework: [], answerKey: [] });
    setTestResults(null);
    setGradingReport(null);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      
      {/* LEFT: OBSERVATION ROOM */}
      <div className="w-full md:w-1/2 flex flex-col border-r border-slate-200 bg-white h-1/2 md:h-full">
        <div className="p-4 bg-indigo-700 text-white shadow-md flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={22} className="text-indigo-200" />
            <h1 className="font-bold tracking-tight uppercase text-[10px] sm:text-xs">Observation Room</h1>
          </div>
          <div className="flex items-center gap-2">
            {Object.keys(dictionary).length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-500/20 rounded-full text-[10px] font-bold text-emerald-200 border border-emerald-500/30">
                <Book size={14} />
                {Object.keys(dictionary).length} TERMS
              </div>
            )}
            <button onClick={resetAll} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Wipe Memory">
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/30">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} ${msg.isSecondary ? 'mt-[-1.5rem]' : ''}`}>
              <div className={`flex gap-3 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {!msg.isSecondary && (
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                  </div>
                )}
                <div className={`px-4 py-3 rounded-xl text-sm shadow-sm transition-all animate-in fade-in slide-in-from-bottom-1 ${
                  msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : msg.isSecondary ? 'bg-amber-50 text-amber-900 border border-amber-200 rounded-tl-none font-medium italic' : 'bg-white text-slate-800 rounded-tl-none border border-slate-200'
                }`}>
                  {msg.text}
                </div>
              </div>
            </div>
          ))}
          {isLoading && <div className="flex justify-start animate-pulse"><div className="w-12 h-6 bg-slate-200 rounded-full" /></div>}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white">
          <div className="flex gap-2">
            <input 
              type="text" 
              value={input} 
              onChange={(e) => setInput(e.target.value)} 
              placeholder="Teach the student something..." 
              className="flex-1 px-4 py-3 bg-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" 
            />
            <button type="submit" disabled={isLoading || !input.trim()} className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all">
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>

      {/* RIGHT: TEACHER HUB */}
      <div className="w-full md:w-1/2 flex flex-col bg-slate-100 h-1/2 md:h-full overflow-y-auto">
        <div className="p-6 sm:p-8 max-w-3xl mx-auto w-full space-y-8">
          <div className="flex justify-between items-end border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tighter italic uppercase">Teacher Hub</h2>
              <p className="text-slate-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.2em]">Curriculum & Vocabulary Control</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
             {/* Dictionary Upload */}
             <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center gap-3 text-center transition-all hover:shadow-md">
                <input type="file" ref={dictInputRef} onChange={handleDictUpload} className="hidden" accept=".json" />
                <div className="bg-indigo-50 p-4 rounded-full">
                  <Book size={32} className="text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm">Vocabulary Control</p>
                  <p className="text-[10px] text-slate-400 font-medium">Upload Dictionary JSON</p>
                </div>
                <button 
                  onClick={() => dictInputRef.current?.click()} 
                  className={`mt-2 text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-full transition-all ${Object.keys(dictionary).length > 0 ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-900 text-white hover:bg-black'}`}
                >
                  {Object.keys(dictionary).length > 0 ? `${Object.keys(dictionary).length} Terms Active` : "Choose File"}
                </button>
             </div>

             {/* Assignment Upload */}
             <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center gap-3 text-center transition-all hover:shadow-md">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.png,.jpg,.jpeg" />
                <div className="bg-indigo-50 p-4 rounded-full">
                  <FileText size={32} className="text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm">Target Assignment</p>
                  <p className="text-[10px] text-slate-400 font-medium">PDF or Images</p>
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className={`mt-2 text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-full transition-all ${uploadedFile ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-900 text-white hover:bg-black'}`}
                >
                   {uploadedFile ? "Update File" : "Choose File"}
                </button>
             </div>
          </div>

          {uploadStatus === 'uploading' && (
            <div className="text-center p-8 bg-white rounded-3xl border border-slate-200 shadow-sm animate-pulse">
              <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="font-bold text-indigo-600 uppercase text-xs tracking-widest">Processing assignment...</p>
            </div>
          )}

          {uploadStatus === 'done' && (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              {/* Knowledge Targets */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-[10px] font-black text-indigo-500 uppercase mb-4 flex items-center gap-2">
                  <Target size={14} /> Knowledge Targets
                </h3>
                <div className="flex flex-wrap gap-2">
                  {extractedData.topics?.map((t, i) => (
                    <span key={i} className="text-[11px] font-bold text-slate-700 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">{t}</span>
                  ))}
                </div>
              </div>

              {/* Mastery Challenges */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-[10px] font-black text-amber-600 uppercase mb-4 flex items-center gap-2">
                  <Zap size={14} /> High-Difficulty Challenges
                </h3>
                <div className="space-y-2">
                  {extractedData.masteryChallenges?.map((challenge, i) => (
                    <div key={i} className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                      <button 
                        onClick={() => setExpandedChallenge(expandedChallenge === i ? null : i)}
                        className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                      >
                        <span className="text-[11px] font-black text-slate-600 uppercase truncate pr-4">
                          Topic: {challenge.topic}
                        </span>
                        <div className="text-slate-400">
                          {expandedChallenge === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      {expandedChallenge === i && (
                        <div className="p-4 bg-white text-[12px] text-slate-600 leading-relaxed border-t border-slate-100 italic">
                          "{challenge.question}"
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Deployment / Grading Results */}
              {!testResults ? (
                <div className="pt-4">
                  <button 
                    onClick={handleDeployAndGrade} 
                    disabled={isDeploying || hiddenMemory.length === 0} 
                    className="group relative w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl hover:bg-indigo-700 disabled:opacity-50 disabled:grayscale transition-all overflow-hidden"
                  >
                    {isDeploying ? (
                      <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Zap size={24} className="group-hover:animate-bounce" />
                        DEPLOY EXAM
                      </>
                    )}
                    {hiddenMemory.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90 text-xs font-bold uppercase tracking-widest">
                        Teach concepts first to enable exam
                      </div>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-6 pb-12 animate-in slide-in-from-bottom-4 duration-500">
                   <div className="bg-slate-900 text-white p-8 rounded-3xl text-center shadow-2xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Star size={120} />
                      </div>
                      <p className="text-indigo-400 font-black text-xs uppercase tracking-widest mb-1">Final Performance Grade</p>
                      <div className="text-7xl font-black mb-2 text-white">{gradingReport?.overallScore}%</div>
                      <div className="h-px bg-white/10 w-24 mx-auto mb-4" />
                      <p className="text-sm italic text-slate-400 px-4">"{gradingReport?.feedback}"</p>
                   </div>

                   {/* Question Breakdown */}
                   <div className="space-y-3">
                      {testResults.map((res, idx) => (
                        <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                          <button onClick={() => setExpandedIndex(expandedIndex === idx ? null : idx)} className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-3 text-left">
                              <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">{idx + 1}</span>
                              <span className="font-bold text-sm text-slate-800 truncate max-w-[200px] sm:max-w-xs">{res.question}</span>
                            </div>
                            <div className="flex items-center gap-2">
                               <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${res.status === 'GUESS' ? 'bg-amber-100 text-amber-700' : res.status === 'SOLVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                                 {res.status}
                               </span>
                               {expandedIndex === idx ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                          </button>
                          {expandedIndex === idx && (
                            <div className="p-4 pt-0 border-t border-slate-50 space-y-4 bg-white animate-in slide-in-from-top-1">
                               <div className="mt-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                  <p className="text-[10px] font-black text-indigo-600 mb-1 flex items-center gap-1"><BrainCircuit size={12} /> STUDENT REASONING</p>
                                  <p className="text-xs italic text-slate-600 leading-relaxed">{res.thoughtProcess}</p>
                               </div>
                               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div className="p-3 bg-white border border-slate-100 rounded-xl">
                                    <p className="text-[9px] font-black text-slate-400 mb-1">AI SUBMISSION</p>
                                    <p className="text-sm font-bold text-slate-800">{res.answer}</p>
                                  </div>
                                  <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                                    <p className="text-[9px] font-black text-indigo-400 mb-1 uppercase">Golden Rubric Key</p>
                                    <ul className="text-xs font-bold text-indigo-900 list-disc list-inside space-y-1">
                                      {extractedData.answerKey[idx]?.points?.map((p, i) => (
                                        <li key={i}>{p}</li>
                                      )) || <li>Correct Conceptual Answer</li>}
                                    </ul>
                                  </div>
                               </div>
                            </div>
                          )}
                        </div>
                      ))}
                   </div>

                   <button 
                    onClick={() => {setTestResults(null); setGradingReport(null);}} 
                    className="w-full py-3 text-slate-400 text-xs font-bold hover:text-indigo-600 transition-colors uppercase tracking-widest"
                   >
                     Clear Results & Retrain
                   </button>
                </div>
              )}
            </div>
          )}

          {uploadStatus === 'error' && (
            <div className="p-8 text-center bg-red-50 text-red-600 rounded-3xl border border-red-100">
              <AlertCircle className="mx-auto mb-2" size={32} />
              <p className="font-bold">Error analyzing document.</p>
              <button onClick={() => setUploadStatus('idle')} className="mt-4 text-xs font-bold underline">Try Again</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
