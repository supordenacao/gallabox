import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ljwvslifkwnjihacfcnu.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxqd3ZzbGlma3duamloYWNmY251Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA1ODAwMiwiZXhwIjoyMDgxNjM0MDAyfQ.HGY4h1ChTpPA76tzX9gO4zwvUC7EU5OIJW0DWT-_TXw';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

    // PAUSE AUTOMÁTICO: 23:00 às 08:00 (horário Brasil)
    const now = new Date();
    const hour = now.getHours(); // 0-23

    if (hour >= 23 || hour < 8) {
      console.log(`Pause ativo (23h-08h) - evento ignorado: ${convId || 'unknown'}`);
      return res.status(200).json({ message: 'OK - pause horário' });
    }  

  try {
    const payload = req.body;
    if (!payload) return res.status(400).json({ message: 'No payload' });

    const convId = payload.conversation?.id || payload.data?.conversation?.id || payload.conversationId;
    if (!convId) return res.status(400).json({ message: 'No conversation ID' });

    // Ignora mensagens do agente
    if (payload.message?.fromMe === true) {
      console.log(`Mensagem do agente ignorada: ${convId}`);
      return res.status(200).json({ message: 'OK - agent message' });
    }

    const contactName = payload.contact?.name || payload.conversation?.contact?.name || 'Sem nome';
    const status = payload.conversation?.status || 'OPEN';
    const tags = payload.conversation?.tags || payload.tags || [];
    const tagNames = tags.map(t => typeof t === 'string' ? t : t.name || '').filter(Boolean);

    // Detecta evento de criação
    const isCreationEvent = payload.event === 'conversation.created' ||
                            (payload.message?.text && payload.message.text.includes('Contact has initiated the conversation')) ||
                            (payload.text && payload.text.includes('Contact has initiated the conversation'));

    let createdAt = payload.conversation?.createdAt || payload.createdAt || payload.timestamp || new Date().toISOString();
    if (isCreationEvent && payload.timestamp) {
      createdAt = new Date(payload.timestamp * 1000).toISOString();
    }

    const lastMessageAt = payload.message?.timestamp ? new Date(payload.message.timestamp * 1000).toISOString() : new Date().toISOString();

    if (status === 'CLOSED' || status === 'closed') {
      const { error } = await supabase.from('open_conversations').delete().eq('id', convId);
      if (error) throw error;
      console.log(`Conversa fechada removida: ${convId}`);
      return res.status(200).json({ message: 'OK' });
    }

    // Busca dados existentes (para count e created_at fixo)
    const { data: existing } = await supabase
      .from('open_conversations')
      .select('created_at, message_count')
      .eq('id', convId)
      .single()
      .maybeSingle();

    let currentCount = (existing?.message_count || 0);
    const finalCreatedAt = existing?.created_at || createdAt;

    // Incrementa count se for mensagem nova
    if (payload.message) {
      currentCount += 1;
    }

    // Limite de 12 mensagens
    if (currentCount > 12) {
      console.log(`Limite de 12 mensagens atingido (${currentCount}) - ignorando: ${convId}`);
      return res.status(200).json({ message: 'OK - message limit reached' });
    }

    // Upsert final
    const { error } = await supabase.from('open_conversations').upsert({
      id: convId,
      contact_name: contactName,
      created_at: finalCreatedAt,
      last_message_at: lastMessageAt,
      status: 'OPEN',
      tags: tagNames,
      message_count: currentCount,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });

    if (error) throw error;
    console.log(`Mensagem processada (${currentCount}/12): ${convId}`);

    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('Erro crítico:', error);
    res.status(500).json({ error: error.message });
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
