const fs = require('fs');
let code = fs.readFileSync('src/context/AuthContext.tsx', 'utf8');

const importReplacement = "import React, { createContext, useContext, useState, useEffect } from 'react';";
code = code.replace(importReplacement, "import React, { createContext, useContext, useState, useEffect, useRef } from 'react';");

const stateInsertion = "  const [token, setToken] = useState<string | null>(localStorage.getItem('qs_token'));\n  const [inactivityTimeoutMinutes, setInactivityTimeoutMinutes] = useState<number>(0);";
code = code.replace("  const [token, setToken] = useState<string | null>(localStorage.getItem('qs_token'));", stateInsertion);

const inactivityEffect = `
  useEffect(() => {
    if (token) {
       axios.get('/api/config').then(res => {
         if (res.data && res.data.inactivityTimeout !== undefined) {
            setInactivityTimeoutMinutes(res.data.inactivityTimeout);
         }
       }).catch(console.error);
    }
  }, [token]);

  useEffect(() => {
    if (!token || inactivityTimeoutMinutes <= 0) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        logout();
        alert('You have been logged out due to inactivity.');
      }, inactivityTimeoutMinutes * 60 * 1000);
    };

    resetTimer();

    // Throttle the activity handler to avoid excessive clearTimeout/setTimeout
    let throttled = false;
    const handleActivity = () => {
      if (!throttled) {
        resetTimer();
        throttled = true;
        setTimeout(() => { throttled = false; }, 1000);
      }
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, handleActivity));

    return () => {
      clearTimeout(timeoutId);
      events.forEach(e => window.removeEventListener(e, handleActivity));
    };
  }, [token, inactivityTimeoutMinutes]);
`;

code = code.replace("  useEffect(() => {\n    const interceptor", inactivityEffect + "\n  useEffect(() => {\n    const interceptor");

fs.writeFileSync('src/context/AuthContext.tsx', code);
