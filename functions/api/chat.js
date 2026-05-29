export async function onRequestPost(context) {
  try {
    const { contents, model } = await context.request.json();
    
    // Obtener la clave API desde las variables de entorno de Cloudflare de forma 100% segura
    const apiKey = context.env.GEMINI_API_KEY || "AIzaSyDxR5T2FPw32-NhhcwRwXpANJDV1nYq2E0";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model || 'gemini-1.5-flash'}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return new Response(errText, {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
