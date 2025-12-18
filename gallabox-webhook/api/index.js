import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ljwvslifkwnjihacfcnu.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxqd3ZzbGlma3duamloYWNmY251Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA1ODAwMiwiZXhwIjoyMDgxNjM0MDAyfQ.HGY4h1ChTpPA76tzX9gO4zwvUC7EU5OIJW0DWT-_TXw';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  console.log('Webhook chamado - Método:', req.method);
  console.log('Headers:', req.headers);
  console.log('Body completo:', req.body);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    const payload = req.body;
    if (!payload) {
      console.log('Payload vazio');
      return res.status(400).json({ message: 'No payload' });
    }

    // Log detalhado do payload
    console.log('Payload recebido:', JSON.stringify(payload, null, 2));

    const convId = payload.conversation?.id || payload.data?.conversation?.id || payload.conversationId || payload.id;
    console.log('Conversation ID extraído:', convId);

    if (!convId) {
      console.log('Nenhum conversation ID encontrado');
      return res.status(400).json({ message: 'No conversation ID' });
    }

    const contactName = payload.contact?.name || payload.conversation?.contact?.name || payload.from || 'Sem nome';
    const status = payload.conversation?.status || payload.status || 'OPEN';
    const tags = payload.conversation?.tags || payload.tags || [];

    const tagNames = Array.isArray(tags) ? tags.map(t => typeof t === 'object' ? t.name : t).filter(Boolean) : [];

    console.log('Dados extraídos:', { contactName, status, tagNames });

    if (status === 'CLOSED' || status === 'closed') {
      const { error } = await supabase.from('open_conversations').delete().eq('id', convId);
      if (error) console.error('Erro ao deletar:', error);
      else console.log('Conversa fechada removida:', convId);
    } else {
      const { data, error } = await supabase.from('open_conversations').upsert({
        id: convId,
        contact_name: contactName,
        created_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        status: 'OPEN',
        tags: tagNames,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

      if (error) console.error('Erro no upsert Supabase:', error);
      else console.log('Conversa salva com sucesso:', data || convId);
    }

    res.status(200).json({ message: 'OK', received: true });

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
