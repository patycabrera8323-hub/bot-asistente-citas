/* =============================================
   ASISTENTE DE CITAS PURE VOICE - app.js
   Experiencia telefónica virtual interactiva
============================================= */

// ─── ESTADO GLOBAL ───────────────────────────
const state = {
  apiKey: localStorage.getItem('gemini_api_key') || 'AIzaSyDxR5T2FPw32-NhhcwRwXpANJDV1nYq2E0',
  businessName: localStorage.getItem('business_name') || 'Luna Spa y Belleza',
  businessDesc: localStorage.getItem('business_desc') || 'Ofrecemos masajes relajantes, limpieza facial y cortes de cabello premium. Atendemos de lunes a sábado de 9:00 AM a 7:00 PM.',
  detectedModel: localStorage.getItem('detected_model') || 'gemini-1.5-flash-latest',
  preferredVoice: localStorage.getItem('preferred_voice') || 'cloud-latin-female',
  messages: [],
  isLoading: false,
  isListening: false,
  recognition: null,
  isCallActive: false,
  currentUtterance: null,
  currentAudio: null,
  appointments: JSON.parse(localStorage.getItem('appointments') || '[]'),
};

// ─── ELEMENTOS DEL DOM ───────────────────────
const voiceContainer = document.querySelector('.voice-container');
const voiceOrb       = document.getElementById('voiceOrb');
const orbIcon        = document.getElementById('orbIcon');
const callStatus     = document.getElementById('callStatus');
const promptText     = document.getElementById('promptText');
const subtitleText   = document.getElementById('subtitleText');
const endCallBtn     = document.getElementById('endCallBtn');
const configBtn      = document.getElementById('configBtn');
const configModal    = document.getElementById('configModal');
const saveConfigBtn  = document.getElementById('saveConfigBtn');
const apiKeyInput    = document.getElementById('apiKeyInput');
const businessNameIn = document.getElementById('businessNameInput');
const businessDescIn = document.getElementById('businessDescInput');
const voiceSelect    = document.getElementById('voiceSelect');

// ─── CONFIGURACIÓN INICIAL ───────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Inicializar interfaz
  setOrbState('idle');

  // Cargar y escuchar voces del navegador
  populateVoices();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }

  if (!state.apiKey) {
    configModal.style.display = 'flex';
  } else {
    initVoiceConversation();
    autoDetectModel(); // Escanear y configurar el modelo adecuado en background
  }

  setupSpeechRecognition();
  setupEventListeners();
});

function initVoiceConversation() {
  state.messages = [
    {
      role: 'user',
      parts: [{ text: getSystemPrompt() }]
    },
    {
      role: 'model',
      parts: [{ text: '¡Hola! Bienvenido a nuestro servicio de reserva por voz. Soy Luna. ¿Cuál es tu nombre y en qué fecha te gustaría agendar tu cita?' }]
    }
  ];
}

// ─── PROMPT DE LUNA EN LA LLAMADA ─────────────
function getSystemPrompt() {
  const today = new Date();
  const dateStr = today.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = today.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  return `Eres Luna, una asistente de voz telefónica profesional, amigable y sumamente eficiente para ${state.businessName}.

INFORMACIÓN DE TU NEGOCIO:
${state.businessDesc || 'Somos un negocio de servicios. Agendamos de lunes a sábado de 9:00 AM a 7:00 PM.'}

FECHA Y HORA ACTUAL DE LA LLAMADA: ${dateStr}, ${timeStr}

TU FUNCIÓN PRINCIPAL:
1. Agendar citas conversando por voz de forma extremadamente rápida.
2. Contestar preguntas sobre el negocio con respuestas cortas e inteligentes.

CUANDO AGENDES UNA CITA EXITOSAMENTE, al final de tu respuesta de voz debes incluir EXACTAMENTE este bloque para que la interfaz lo guarde automáticamente:
[[CITA_CONFIRMADA]]
Nombre: [nombre del cliente]
Servicio: [servicio solicitado]
Fecha: [fecha de la cita]
Hora: [hora de la cita]
Notas: [detalles o notas]
[[/CITA_CONFIRMADA]]

REGLAS DE VOZ CRÍTICAS:
- Responde SIEMPRE en español.
- Tus respuestas deben ser MUY CORTAS (máximo 1 o 2 oraciones sencillas) porque la gente prefiere llamadas rápidas.
- No uses viñetas ni asteriscos en tu texto, ya que esto confunde al motor de lectura de voz.
- Sé directa. Si te piden agendar, pregunta por su nombre, el servicio, la fecha y la hora directamente en una sola frase breve.`;
}

// ─── CONTROL DE LA ESFERA (ESTADOS VISUALES) ──
function setOrbState(status) {
  // Remover estados previos
  voiceContainer.classList.remove('idle', 'listening', 'thinking', 'speaking');
  
  if (status === 'idle') {
    voiceContainer.classList.add('idle');
    orbIcon.textContent = '📞';
    callStatus.textContent = 'Llamada inactiva';
    promptText.textContent = 'Toca la esfera para iniciar la llamada de voz';
  } else if (status === 'listening') {
    voiceContainer.classList.add('listening');
    orbIcon.textContent = '🎙️';
    callStatus.textContent = 'Escuchándote...';
    promptText.textContent = 'Luna te está oyendo. Habla ahora.';
  } else if (status === 'thinking') {
    voiceContainer.classList.add('thinking');
    orbIcon.textContent = '⚡';
    callStatus.textContent = 'Luna está pensando...';
    promptText.textContent = 'Conectando con la IA...';
  } else if (status === 'speaking') {
    voiceContainer.classList.add('speaking');
    orbIcon.textContent = '🗣️';
    callStatus.textContent = 'Luna está hablando...';
    promptText.textContent = 'Escucha con atención.';
  }
}

// ─── MANEJO DE LLAMADA ───────────────────────
function setupEventListeners() {
  // Click en la esfera para Iniciar/Alternar llamada
  voiceOrb.addEventListener('click', () => {
    if (!state.apiKey) {
      configModal.style.display = 'flex';
      return;
    }

    // ✦ DESBLOQUEAR EL REPRODUCTOR DE AUDIO:
    // Reproducimos un audio en blanco súper corto para ganarnos el permiso del navegador (autoplay bypass)
    const player = document.getElementById('voicePlayer');
    if (player) {
      player.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
      player.play().catch(e => console.warn("Intento de desbloqueo de audio:", e.message));
    }

    if (!state.isCallActive) {
      startCall();
    } else {
      // Si la llamada está activa y tocamos la esfera mientras habla, la interrumpimos para volver a hablar nosotros
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }
      if (state.currentAudio) {
        state.currentAudio.pause();
        state.currentAudio = null;
      }
      startListening();
    }
  });

  endCallBtn.addEventListener('click', endCall);

  // Configuración
  configBtn.addEventListener('click', () => {
    apiKeyInput.value = state.apiKey;
    businessNameIn.value = state.businessName;
    businessDescIn.value = state.businessDesc;
    configModal.style.display = 'flex';
  });

  saveConfigBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      apiKeyInput.style.borderColor = '#ff4757';
      apiKeyInput.focus();
      return;
    }

    state.apiKey = key;
    state.businessName = businessNameIn.value.trim() || 'Mi Negocio';
    state.businessDesc = businessDescIn.value.trim();
    state.preferredVoice = voiceSelect.value;

    localStorage.setItem('gemini_api_key', key);
    localStorage.setItem('business_name', state.businessName);
    localStorage.setItem('business_desc', state.businessDesc);
    localStorage.setItem('preferred_voice', state.preferredVoice);

    configModal.style.display = 'none';
    initVoiceConversation();
    autoDetectModel(); // Escanear y configurar el modelo adecuado de inmediato
  });
}

// Iniciar Llamada
function startCall() {
  state.isCallActive = true;
  endCallBtn.style.display = 'block';
  subtitleText.textContent = 'Iniciando conversación...';
  
  // Saludo inicial de voz
  const saludo = 'Hola. Bienvenida a nuestro servicio de reserva por voz de ' + state.businessName + '. Soy Luna. ¿Con quién tengo el gusto de hablar y para qué día necesitas agendar tu cita?';
  
  setOrbState('speaking');
  speakText(saludo, () => {
    // Al terminar el saludo, empieza a escuchar de inmediato
    startListening();
  });
}

// Colgar Llamada
function endCall() {
  state.isCallActive = false;
  endCallBtn.style.display = 'none';
  stopListening();
  
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }
  
  setOrbState('idle');
  subtitleText.textContent = '"Llamada finalizada"';
  initVoiceConversation(); // Reiniciar contexto
}

// ─── RECONOCIMIENTO DE VOZ (STT) ─────────────
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    alert('Tu navegador o dispositivo no soporta reconocimiento de voz. Usa Google Chrome o Microsoft Edge.');
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.lang = 'es-MX';
  state.recognition.interimResults = true;
  state.recognition.continuous = false;

  state.recognition.onstart = () => {
    state.isListening = true;
    setOrbState('listening');
  };

  state.recognition.onresult = (e) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = e.resultIndex; i < e.results.length; ++i) {
      if (e.results[i].isFinal) {
        finalTranscript += e.results[i][0].transcript;
      } else {
        interimTranscript += e.results[i][0].transcript;
      }
    }

    // Mostrar subtítulos interactivos
    const textToShow = finalTranscript || interimTranscript;
    if (textToShow) {
      subtitleText.textContent = `Tú: "${textToShow}"`;
    }
  };

  state.recognition.onspeechend = () => {
    // Detectó que el usuario dejó de hablar
    state.recognition.stop();
  };

  state.recognition.onend = () => {
    state.isListening = false;
    
    // Si la llamada está activa y el usuario terminó de hablar, mandamos a procesar el texto final
    if (state.isCallActive) {
      const text = subtitleText.textContent.replace('Tú: "', '').replace('"', '').trim();
      if (text && text !== '...' && text !== 'Iniciando conversación...') {
        processVoiceInput(text);
      } else {
        // Si no se escuchó nada útil, re-iniciamos escucha en 1.5 segundos
        setTimeout(() => {
          const isSpeaking = window.speechSynthesis.speaking || (state.currentAudio && !state.currentAudio.paused);
          if (state.isCallActive && !isSpeaking && !state.isLoading) {
            startListening();
          }
        }, 1500);
      }
    }
  };

  state.recognition.onerror = (e) => {
    console.warn('Speech Rec Error:', e.error);
    stopListening();
  };
}

function startListening() {
  if (!state.isCallActive || state.isLoading) return;
  
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel(); // Silenciar si Luna estaba hablando
  }
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }

  setOrbState('listening');
  try {
    state.recognition.start();
  } catch (err) {
    // Si ya estaba iniciado
  }
}

function stopListening() {
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch (_) {}
  }
}

// ─── PROCESAMIENTO DE AUDIO (CONEXIÓN A GEMINI Y FALLBACK) ───
async function processVoiceInput(text) {
  if (state.isLoading) return;
  
  state.isLoading = true;
  setOrbState('thinking');
  
  state.messages.push({ role: 'user', parts: [{ text: text }] });

  // Intentar con gemini-1.5-flash en el endpoint estable v1 (máxima compatibilidad)
  // y gemini-2.0-flash en v1beta como secundario
  const primaryModel = state.detectedModel || 'gemini-1.5-flash';
  const attempts = [
    {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${state.apiKey}`,
      model: `${primaryModel} (v1beta)`
    },
    {
      url: `https://generativelanguage.googleapis.com/v1/models/${primaryModel}:generateContent?key=${state.apiKey}`,
      model: `${primaryModel} (v1)`
    }
  ];
  let success = false;
  let botText = '';
  let lastError = null;

  for (const attempt of attempts) {
    try {
      const response = await fetch(
        attempt.url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: state.messages,
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 350,
              topP: 0.8,
            }
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `Error con ${attempt.model}`);
      }

      const data = await response.json();
      botText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      success = true;
      break;
    } catch (err) {
      console.warn(`Fallo con ${attempt.model}:`, err.message);
      lastError = err;
    }
  }

  state.isLoading = false;

  if (success && botText) {
    // Registrar respuesta en el historial
    state.messages.push({ role: 'model', parts: [{ text: botText }] });
    
    // Procesar si agendó cita
    const cleanText = extractAppointmentData(botText);
    
    // Mostrar subtítulo del bot
    subtitleText.textContent = `Luna: "${cleanText}"`;
    
    // Decir en voz alta
    setOrbState('speaking');
    speakText(cleanText, () => {
      // Al terminar de hablar, abrir el micrófono del usuario de inmediato para responder fluida
      if (state.isCallActive) {
        startListening();
      }
    });
  } else {
    // Error al conectar
    let errorMsg = 'Lo siento, tuve un problema de conexión. ¿Puedes repetirlo en unos segundos?';
    const errMsgLower = (lastError?.message || '').toLowerCase();
    
    if (errMsgLower.includes('api_key') || errMsgLower.includes('invalid')) {
      errorMsg = 'Tu API key de Gemini parece no ser válida o está inactiva en tu cuenta.';
    } else if (errMsgLower.includes('quota') || errMsgLower.includes('limit') || errMsgLower.includes('exhausted') || errMsgLower.includes('429')) {
      errorMsg = 'Google todavía está activando tu API Key. Por favor espera un minuto y vuelve a hablarme.';
    }

    subtitleText.textContent = `Error: "${errorMsg}"`;
    setOrbState('speaking');
    speakText(errorMsg, () => {
      if (state.isCallActive) {
        setOrbState('idle');
      }
    });
  }
}

// ─── DETECCIÓN Y PARSEO DE CITAS CONFIRMADAS ─
function extractAppointmentData(text) {
  const citaMatch = text.match(/\[\[CITA_CONFIRMADA\]\]([\s\S]*?)\[\[\/CITA_CONFIRMADA\]\]/);

  if (citaMatch) {
    const rawData = citaMatch[1].trim();
    
    const getVal = (key) => {
      const match = rawData.match(new RegExp(`${key}:\\s*(.+)`));
      return match ? match[1].trim() : 'N/D';
    };

    const appt = {
      id: Date.now(),
      nombre:   getVal('Nombre'),
      servicio: getVal('Servicio'),
      fecha:    getVal('Fecha'),
      hora:     getVal('Hora'),
      notas:    getVal('Notas'),
    };

    // Guardar
    state.appointments.push(appt);
    localStorage.setItem('appointments', JSON.stringify(state.appointments));
    
    // Mostrar UI Slideup
    showAppointmentSlideup(appt);

    // Limpiar etiquetas de la respuesta de voz
    return text.replace(/\[\[CITA_CONFIRMADA\]\][\s\S]*?\[\[\/CITA_CONFIRMADA\]\]/g, '').trim();
  }

  return text;
}

function showAppointmentSlideup(appt) {
  const slideup = document.getElementById('appointmentCard');
  const details = document.getElementById('apptDetails');

  details.innerHTML = `
    <div>📛 <strong>Cliente:</strong> ${appt.nombre}</div>
    <div>🔧 <strong>Servicio:</strong> ${appt.servicio}</div>
    <div>📅 <strong>Fecha:</strong> ${appt.fecha}</div>
    <div>🕐 <strong>Hora:</strong> ${appt.hora}</div>
    ${appt.notas && appt.notas !== 'N/D' ? `<div>📝 <strong>Notas:</strong> ${appt.notas}</div>` : ''}
  `;

  slideup.classList.add('active');
}

// ─── MOTOR DE VOZ SÍNTESIS (TTS) ─────────────
function speakText(text, callback) {
  // Prioridad absoluta: Si el usuario seleccionó la voz de la nube (o no hay voz preferida aún)
  if (state.preferredVoice === 'cloud-latin-female' || !state.preferredVoice) {
    speakTextGoogleTTS(text, callback);
  } else {
    speakTextWebSpeech(text, callback);
  }
}

// Voz Ultra-Natural Latinoamericana (Google Cloud Translate TTS)
function speakTextGoogleTTS(text, callback) {
  // Limpiar caracteres extraños
  const cleanText = text
    .replace(/[*#_\[\]]/g, '')
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
    .trim();

  if (!cleanText) {
    if (callback) callback();
    return;
  }

  // Silenciar cualquier voz previa
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (state.currentAudio) {
    state.currentAudio.pause();
  }

  // Dividir el texto en bloques de máximo 180 caracteres (por límite de Google TTS)
  const sentences = cleanText.match(/[^.!?]+[.!?]*/g) || [cleanText];
  const chunks = [];
  
  sentences.forEach(s => {
    let part = s.trim();
    while (part.length > 0) {
      if (part.length <= 180) {
        chunks.push(part);
        part = "";
      } else {
        let splitIdx = part.lastIndexOf(' ', 180);
        if (splitIdx === -1) splitIdx = 180;
        chunks.push(part.substring(0, splitIdx));
        part = part.substring(splitIdx).trim();
      }
    }
  });

  let currentChunk = 0;
  
  function playNextChunk() {
    if (!state.isCallActive) {
      setOrbState('idle');
      return;
    }

    if (currentChunk >= chunks.length) {
      setOrbState('idle');
      if (callback) callback();
      return;
    }

    const textToSpeak = chunks[currentChunk];
    currentChunk++;

    // URL de Google Translate TTS en español latinoamericano (es-419)
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=es-419&client=tw-ob&q=${encodeURIComponent(textToSpeak)}`;
    
    // Usar el reproductor desbloqueado en lugar de crear un objeto Audio nuevo en cada llamada
    const audio = document.getElementById('voicePlayer');
    if (audio) {
      audio.src = url;
      state.currentAudio = audio;
      
      audio.onended = () => {
        playNextChunk();
      };

      audio.onerror = (e) => {
        console.warn("Fallo reproducción Google TTS en reproductor, usando local fallback:", e);
        speakTextWebSpeech(textToSpeak, () => {
          playNextChunk();
        });
      };

      audio.play().catch(err => {
        console.warn("Fallo play() en reproductor, usando local fallback:", err);
        speakTextWebSpeech(textToSpeak, () => {
          playNextChunk();
        });
      });
    } else {
      // Fallback si por alguna razón no se encuentra el tag audio
      const backupAudio = new Audio(url);
      state.currentAudio = backupAudio;
      backupAudio.onended = () => playNextChunk();
      backupAudio.onerror = () => speakTextWebSpeech(textToSpeak, () => playNextChunk());
      backupAudio.play().catch(() => speakTextWebSpeech(textToSpeak, () => playNextChunk()));
    }
  }

  setOrbState('speaking');
  playNextChunk();
}

// Voz local del navegador (Web Speech API)
function speakTextWebSpeech(text, callback) {
  if (!window.speechSynthesis) {
    if (callback) callback();
    return;
  }

  window.speechSynthesis.cancel();
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }

  const cleanText = text
    .replace(/[*#_\[\]]/g, '')
    .replace(/[\u{1F300}-\u{1FFFF}]/gu, '')
    .trim();

  const utter = new SpeechSynthesisUtterance(cleanText);
  utter.lang = 'es-MX';
  utter.rate = 0.98;
  utter.pitch = 1.02;
  utter.volume = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const esVoices = voices.filter(v => v.lang.startsWith('es'));

  let premiumVoice = esVoices.find(v => v.name === state.preferredVoice);

  if (!premiumVoice) {
    premiumVoice = 
      esVoices.find(v => !v.localService && v.name.toLowerCase().includes('natural')) ||
      esVoices.find(v => !v.localService && (v.name.toLowerCase().includes('yolanda') || v.name.toLowerCase().includes('dalia') || v.name.toLowerCase().includes('elena'))) ||
      esVoices.find(v => v.name.toLowerCase().includes('google')) ||
      esVoices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('mujer') || v.name.toLowerCase().includes('sandra') || v.name.toLowerCase().includes('sabina') || v.name.toLowerCase().includes('helena')) ||
      esVoices[0];
  }

  if (premiumVoice) {
    utter.voice = premiumVoice;
    console.log("Voz del sistema seleccionada:", premiumVoice.name);
  }

  utter.onend = () => {
    setOrbState('idle');
    if (state.isCallActive && callback) {
      callback();
    }
  };

  utter.onerror = (e) => {
    console.error('Speech synthesis local error:', e);
    setOrbState('idle');
    if (state.isCallActive && callback) {
      callback();
    }
  };

  state.currentUtterance = utter;
  window.speechSynthesis.speak(utter);
}

// ─── UTILS DE VOZ Y MODELOS ────────────────────

// Cargar y listar todas las voces del dispositivo en el selector
function populateVoices() {
  if (!voiceSelect) return;

  // Cargar lista de voces del navegador
  let voices = [];
  if (window.speechSynthesis) {
    voices = window.speechSynthesis.getVoices();
  }
  const esVoices = voices.filter(v => v.lang.startsWith('es'));

  // Guardar la selección actual
  const currentSelection = voiceSelect.value || state.preferredVoice;

  // Limpiar el selector
  voiceSelect.innerHTML = '';

  // ✦ Prioridad 1: Agregar siempre la voz ultra-natural en la nube
  const cloudOption = document.createElement('option');
  cloudOption.value = 'cloud-latin-female';
  cloudOption.textContent = 'Luna Premium (Voz Latinoamericana Ultra-Natural) ✦ [Recomendado]';
  if (currentSelection === 'cloud-latin-female' || !currentSelection) {
    cloudOption.selected = true;
    state.preferredVoice = 'cloud-latin-female';
  }
  voiceSelect.appendChild(cloudOption);

  // Ordenar voces premium locales online al inicio
  esVoices.sort((a, b) => {
    const aPremium = !a.localService ? 1 : 0;
    const bPremium = !b.localService ? 1 : 0;
    return bPremium - aPremium;
  });

  esVoices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.name;
    const typeLabel = voice.localService ? '[Básica Offline]' : '[Premium Natural Online]';
    option.textContent = `${voice.name} (${voice.lang}) ${typeLabel}`;
    
    if (voice.name === currentSelection) {
      option.selected = true;
    }
    
    voiceSelect.appendChild(option);
  });
}

// Autodetectar dinámicamente los modelos activos del usuario para evitar errores
async function autoDetectModel() {
  if (!state.apiKey) return;

  console.log("Iniciando escaneo de modelos Gemini autorizados...");
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${state.apiKey}`);
    if (response.ok) {
      const data = await response.json();
      const models = data.models || [];
      console.log("Lista de modelos en tu cuenta:", models);

      // Buscar modelos que soporten generateContent
      const generateModels = models.filter(m => m.supportedGenerationMethods.includes('generateContent'));

      if (generateModels.length > 0) {
        // 1. Intentar buscar un modelo de la familia 1.5 flash
        // (Recomendado porque el usuario tiene gemini-2.0 bloqueado por cuota 0 en su región)
        let matched = generateModels.find(m => m.name.includes('gemini-1.5-flash'));
        
        // 2. Si no, cualquier modelo flash
        if (!matched) {
          matched = generateModels.find(m => m.name.includes('flash'));
        }
        
        // 3. Si no, cualquier modelo disponible
        if (!matched) {
          matched = generateModels[0];
        }

        const cleanName = matched.name.replace('models/', '');
        state.detectedModel = cleanName;
        localStorage.setItem('detected_model', cleanName);
        console.log("🎯 ¡Modelo autodetectado y configurado exitosamente!: ", cleanName);
        return;
      }
    }
  } catch (err) {
    console.warn("Fallo la autodetectación de modelos, usando fallback estable:", err.message);
  }

  // Fallback si falla
  state.detectedModel = 'gemini-1.5-flash';
  localStorage.setItem('detected_model', 'gemini-1.5-flash');
}
